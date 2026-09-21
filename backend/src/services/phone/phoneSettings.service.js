'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { ROLES } = require('../../constants/roles');
const { getDiditConfig } = require('../kyc/didit.client');

const KEY = 'phone_verification';
/** Opt-in: no setting row → disabled until an admin enables the store. */
const DEFAULTS = { enabled: false };

function normalizeStoreCode(code) {
  return String(code || '')
    .trim()
    .toLowerCase();
}

function parseBoolEnabled(value, fallback = false) {
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
      enabled: parseBoolEnabled(parsed.enabled, false),
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      updatedAt: parsed.updatedAt ? String(parsed.updatedAt) : null
    };
  } catch {
    return null;
  }
}

/**
 * Stores provisioned for phone OTP (env allowlist).
 * Empty PHONE_VERIFY_STORE_CODES → all stores are considered configured / toggleable.
 * @returns {Set<string>|null} null means all stores
 */
function getPhoneConfiguredStoreCodes() {
  const raw = String(config.get('didit.phoneStoreCodes') || '').trim();
  if (!raw) return null;
  const set = new Set(
    raw
      .split(',')
      .map((s) => normalizeStoreCode(s))
      .filter(Boolean)
  );
  return set.size ? set : null;
}

function isPhoneConfiguredForStore(storeCode) {
  const configured = getPhoneConfiguredStoreCodes();
  if (!configured) return true;
  const sc = normalizeStoreCode(storeCode);
  return Boolean(sc && configured.has(sc));
}

/** @deprecated use isPhoneConfiguredForStore */
function isPhoneEnforcedForStore(storeCode) {
  return isPhoneConfiguredForStore(storeCode);
}

function getPhoneEnforcedStoreCodes() {
  return getPhoneConfiguredStoreCodes();
}

function isDiditPhoneConfigured() {
  const cfg = getDiditConfig();
  return Boolean(cfg.apiKey);
}

/**
 * Effective phone OTP on/off for a store (admin toggle + provisioned allowlist).
 */
async function getPhoneSettingsForStore(storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code || !isPhoneConfiguredForStore(code)) {
    return {
      enabled: false,
      configured: false,
      updatedBy: null,
      updatedAt: null,
      hasOverride: false
    };
  }

  const row = await db.Setting.findOne({
    where: {
      key: KEY,
      storeCode: { [Op.iLike]: code }
    },
    order: [['id', 'DESC']],
    raw: true
  });

  const parsed = parseSettingsValue(row?.value);
  if (parsed) {
    return {
      enabled: parsed.enabled === true,
      configured: true,
      updatedBy: parsed.updatedBy,
      updatedAt: parsed.updatedAt || row?.updated_at || null,
      hasOverride: true
    };
  }

  return {
    enabled: DEFAULTS.enabled === true,
    configured: true,
    updatedBy: null,
    updatedAt: null,
    hasOverride: false
  };
}

async function updateStorePhoneSettings(storeCode, payload = {}, { updatedBy } = {}) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!isPhoneConfiguredForStore(code)) {
    const err = new Error(
      `Phone verification is not configured for store "${code}" yet. Add it to PHONE_VERIFY_STORE_CODES and Didit credentials first.`
    );
    err.statusCode = 400;
    throw err;
  }

  const enabled = parseBoolEnabled(payload.enabled, false);
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
    configured: true,
    updatedBy: actor,
    updatedAt: nowIso,
    hasOverride: true
  };
}

async function listAllStorePhoneSettings() {
  const cfg = getDiditConfig();
  const diditReady = Boolean(cfg.apiKey);
  const configuredSet = getPhoneConfiguredStoreCodes();

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
  const uniqueStores = [];
  for (const s of stores || []) {
    const code = normalizeStoreCode(s.storeCode);
    const mapKey = `${s.distributorCode || ''}|${code}`;
    if (!code || seen.has(mapKey)) continue;
    seen.add(mapKey);
    uniqueStores.push(s);
  }

  const storeList = uniqueStores.map((s) => {
    const code = normalizeStoreCode(s.storeCode);
    const mapKey = `${s.distributorCode || ''}|${code}`;
    const configured = !configuredSet || configuredSet.has(code);
    const parsed = settingsMap.get(mapKey) || null;

    let enabled = false;
    let updatedBy = null;
    let updatedAt = null;
    let hasOverride = false;

    if (!configured) {
      enabled = false;
    } else if (parsed) {
      enabled = parsed.enabled === true;
      updatedBy = parsed.updatedBy;
      updatedAt = parsed.updatedAt;
      hasOverride = true;
    } else {
      enabled = DEFAULTS.enabled === true;
    }

    return {
      userId: s.userId,
      username: s.username,
      email: s.email,
      distributorCode: s.distributorCode,
      storeCode: s.storeCode,
      isActive: s.isActive !== false,
      configured,
      enabled,
      locked: !configured,
      updatedBy,
      updatedAt,
      hasOverride
    };
  });

  return {
    stores: storeList,
    configured: diditReady,
    hasApiKey: Boolean(cfg.apiKey),
    hasWebhookSecret: Boolean(cfg.webhookSecret),
    apiBaseUrl: cfg.apiBaseUrl,
    enforcedStores: String(config.get('didit.phoneStoreCodes') || ''),
    storeScoped: Boolean(configuredSet)
  };
}

async function getPhoneSettingsAdminView() {
  return listAllStorePhoneSettings();
}

/**
 * Whether phone OTP is required for this store (Didit key + provisioned + admin enabled).
 */
async function isPhoneVerificationRequiredForStore(storeCode) {
  if (!isDiditPhoneConfigured()) return false;
  const effective = await getPhoneSettingsForStore(storeCode);
  return Boolean(effective.configured && effective.enabled);
}

module.exports = {
  KEY,
  getPhoneSettingsForStore,
  updateStorePhoneSettings,
  getPhoneSettingsAdminView,
  listAllStorePhoneSettings,
  isPhoneVerificationRequiredForStore,
  isPhoneEnforcedForStore,
  isPhoneConfiguredForStore,
  getPhoneEnforcedStoreCodes,
  getPhoneConfiguredStoreCodes,
  isDiditPhoneConfigured
};
