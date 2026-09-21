'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

const KEY = 'slot_providers';

const PROVIDER_KEYS = ['gitslotpark', 'bona', 'onegamehub', 'scorpio'];

const DEFAULTS = {
  gitslotpark: true,
  bona: true,
  onegamehub: true,
  scorpio: true
};

function parseBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function parseRow(row) {
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return {
      gitslotpark: parseBool(parsed.gitslotpark, DEFAULTS.gitslotpark),
      bona: parseBool(parsed.bona, DEFAULTS.bona),
      onegamehub: parseBool(parsed.onegamehub, DEFAULTS.onegamehub),
      scorpio: parseBool(parsed.scorpio, DEFAULTS.scorpio)
    };
  } catch {
    return null;
  }
}

function normalizePayload(payload = {}) {
  return {
    gitslotpark: parseBool(payload.gitslotpark, DEFAULTS.gitslotpark),
    bona: parseBool(payload.bona, DEFAULTS.bona),
    onegamehub: parseBool(payload.onegamehub, DEFAULTS.onegamehub),
    scorpio: parseBool(payload.scorpio, DEFAULTS.scorpio)
  };
}

function emptyToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

async function readFromSetting(distributorCode, storeCode) {
  const row = await db.Setting.findOne({
    where: {
      key: KEY,
      distributorCode: emptyToNull(distributorCode),
      storeCode: emptyToNull(storeCode)
    }
  });
  return parseRow(row);
}

async function readFromStoreCode(storeCode) {
  const norm = emptyToNull(storeCode);
  if (!norm) return null;
  const row = await db.Setting.findOne({
    where: { key: KEY, storeCode: { [Op.iLike]: norm } },
    order: [['updated_at', 'DESC']]
  });
  return parseRow(row);
}

async function getSlotProviderSettings(scope = null) {
  const storeCode = emptyToNull(scope && scope.storeCode);
  if (storeCode) {
    const byStoreCode = await readFromStoreCode(storeCode);
    if (byStoreCode) return { ...byStoreCode };
    const storeSettings = await readFromSetting(scope.distributorCode, storeCode);
    if (storeSettings) return { ...storeSettings };
    return { ...DEFAULTS };
  }
  const globalSettings = await readFromSetting(null, null);
  if (globalSettings) return { ...globalSettings };
  return { ...DEFAULTS };
}

async function updateSlotProviderSettings(payload, scope = null) {
  const settings = normalizePayload(payload);
  const distributorCode = emptyToNull(scope && scope.distributorCode);
  const storeCode = emptyToNull(scope && scope.storeCode);
  const json = JSON.stringify(settings);

  if (storeCode) {
    const existing = await db.Setting.findAll({
      where: { key: KEY, storeCode: { [Op.iLike]: storeCode } }
    });
    if (existing.length) {
      await Promise.all(existing.map((row) => row.update({ value: json })));
      return { ...settings };
    }
  }

  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value: json }
  });
  await row.update({ value: json });
  return { ...settings };
}

async function resolveScopeFromStoreCode(storeCode) {
  const norm = storeCode && String(storeCode).trim();
  if (!norm) return null;
  const storeAdmin = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeCode: { [Op.iLike]: norm },
      storeRoleId: null
    },
    attributes: ['distributorCode', 'storeCode'],
    raw: true
  });
  if (storeAdmin) {
    return {
      distributorCode: storeAdmin.distributorCode ?? null,
      storeCode: storeAdmin.storeCode ?? norm
    };
  }
  return { distributorCode: null, storeCode: norm };
}

async function resolveScopeFromStoreUserId(userId) {
  const store = await db.User.findOne({
    where: { userId, role: ROLES.STORE_ADMIN, storeRoleId: null },
    attributes: ['userId', 'username', 'storeCode', 'distributorCode']
  });
  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    throw err;
  }
  return {
    store,
    scope: {
      distributorCode: store.distributorCode ?? null,
      storeCode: store.storeCode ?? null
    }
  };
}

function resolveStoreCodeFromReq(req) {
  const header = req.headers && (req.headers['x-store-code'] || req.headers['x-storecode']);
  const fromHeader = header != null ? String(header).trim() : '';
  const rawQuery = req.query?.store_code;
  const fromQuery = Array.isArray(rawQuery)
    ? String(rawQuery[0] || '').trim()
    : rawQuery != null
      ? String(rawQuery).trim()
      : '';
  const fromUser = req.user?.storeCode != null ? String(req.user.storeCode).trim() : '';
  return fromQuery || fromHeader || fromUser || '';
}

async function isSlotProviderEnabled(req, providerKey) {
  const key = String(providerKey || '').trim().toLowerCase();
  if (!PROVIDER_KEYS.includes(key)) return true;
  const storeCode = resolveStoreCodeFromReq(req);
  const scope = await resolveScopeFromStoreCode(storeCode);
  const settings = await getSlotProviderSettings(scope);
  return settings[key] !== false;
}

async function assertSlotProviderEnabled(req, providerKey) {
  const enabled = await isSlotProviderEnabled(req, providerKey);
  if (enabled) return;
  const err = new Error('This game provider is not enabled for this store');
  err.statusCode = 400;
  err.code = 'PROVIDER_DISABLED';
  throw err;
}

module.exports = {
  KEY,
  PROVIDER_KEYS,
  DEFAULTS,
  getSlotProviderSettings,
  updateSlotProviderSettings,
  resolveScopeFromStoreCode,
  resolveScopeFromStoreUserId,
  resolveStoreCodeFromReq,
  isSlotProviderEnabled,
  assertSlotProviderEnabled
};
