'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

const KEY = 'geo_block';
/** No setting row → geo blocking stays on for that store. */
const DEFAULT_ENABLED = true;

function normalizeStoreCode(code) {
  return String(code || '')
    .trim()
    .toLowerCase();
}

function parseBoolEnabled(value, fallback = DEFAULT_ENABLED) {
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return fallback;
}

function parseSettingsValue(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      enabled: parseBoolEnabled(parsed.enabled, DEFAULT_ENABLED),
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      updatedAt: parsed.updatedAt ? String(parsed.updatedAt) : null
    };
  } catch {
    return null;
  }
}

/**
 * Effective geo on/off for a store.
 * Missing store code or a missing row keeps blocking on.
 */
async function isGeoBlockEnabledForStore(storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) return true;

  const row = await db.Setting.findOne({
    where: {
      key: KEY,
      storeCode: { [Op.iLike]: code }
    },
    order: [['id', 'DESC']],
    raw: true
  });

  const parsed = parseSettingsValue(row?.value);
  if (!parsed) return true;
  return parsed.enabled !== false;
}

async function updateStoreGeoBlockSettings(storeCode, payload = {}, { updatedBy } = {}) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }

  const enabled = parseBoolEnabled(payload.enabled, DEFAULT_ENABLED);
  const nowIso = new Date().toISOString();
  const actor = updatedBy ? String(updatedBy).trim().slice(0, 128) : null;
  const value = {
    enabled,
    updatedBy: actor,
    updatedAt: nowIso
  };

  const storeAdmin = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      storeCode: { [Op.iLike]: code }
    },
    attributes: ['distributorCode', 'storeCode'],
    raw: true
  });
  const distributorCode = storeAdmin?.distributorCode || null;
  const canonicalStoreCode = storeAdmin?.storeCode || code;

  const [row] = await db.Setting.findOrCreate({
    where: {
      key: KEY,
      distributorCode,
      storeCode: canonicalStoreCode
    },
    defaults: {
      key: KEY,
      distributorCode,
      storeCode: canonicalStoreCode,
      value: JSON.stringify(value)
    }
  });
  await row.update({ value: JSON.stringify(value) });

  return {
    storeCode: canonicalStoreCode,
    distributorCode,
    enabled,
    updatedBy: actor,
    updatedAt: nowIso
  };
}

async function listAllStoreGeoBlockSettings() {
  const [stores, settingRows] = await Promise.all([
    db.User.findAll({
      where: {
        role: ROLES.STORE_ADMIN,
        storeRoleId: null,
        storeCode: { [Op.ne]: null }
      },
      attributes: ['userId', 'username', 'email', 'distributorCode', 'storeCode', 'isActive'],
      order: [
        ['distributorCode', 'ASC'],
        ['storeCode', 'ASC']
      ],
      raw: true
    }),
    db.Setting.findAll({
      where: { key: KEY, storeCode: { [Op.ne]: null } },
      attributes: ['distributorCode', 'storeCode', 'value', 'updated_at'],
      raw: true
    })
  ]);

  const settingsMap = new Map();
  for (const row of settingRows || []) {
    const mapKey = `${row.distributorCode || ''}|${normalizeStoreCode(row.storeCode)}`;
    const parsed = parseSettingsValue(row.value);
    if (parsed) {
      settingsMap.set(mapKey, {
        ...parsed,
        updatedAt: parsed.updatedAt || row.updated_at || null
      });
    }
  }

  const seen = new Set();
  const storeList = [];
  for (const s of stores || []) {
    const code = normalizeStoreCode(s.storeCode);
    const mapKey = `${s.distributorCode || ''}|${code}`;
    if (!code || seen.has(mapKey)) continue;
    seen.add(mapKey);
    const parsed = settingsMap.get(mapKey) || null;
    storeList.push({
      userId: s.userId,
      username: s.username,
      email: s.email,
      distributorCode: s.distributorCode,
      storeCode: s.storeCode,
      isActive: s.isActive !== false,
      enabled: parsed ? parsed.enabled !== false : true,
      updatedBy: parsed?.updatedBy || null,
      updatedAt: parsed?.updatedAt || null,
      hasOverride: Boolean(parsed)
    });
  }

  return { stores: storeList };
}

module.exports = {
  KEY,
  isGeoBlockEnabledForStore,
  updateStoreGeoBlockSettings,
  listAllStoreGeoBlockSettings
};
