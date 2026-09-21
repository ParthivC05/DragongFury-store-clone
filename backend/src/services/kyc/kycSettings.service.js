'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { ROLES } = require('../../constants/roles');
const { getDiditConfig } = require('./didit.client');

const KEY = 'didit_kyc';
const DEFAULTS = { enabled: true };

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
 * Stores that are provisioned for Didit KYC (env allowlist).
 * Empty KYC_STORE_CODES → all stores are considered configured.
 * @returns {Set<string>|null} null means all stores are configured
 */
function getKycConfiguredStoreCodes() {
  const raw = String(config.get('didit.storeCodes') || '').trim();
  if (!raw) return null;
  const set = new Set(
    raw
      .split(',')
      .map((s) => normalizeStoreCode(s))
      .filter(Boolean)
  );
  return set.size ? set : null;
}

function isKycConfiguredForStore(storeCode) {
  const configured = getKycConfiguredStoreCodes();
  if (!configured) return true;
  const sc = normalizeStoreCode(storeCode);
  return Boolean(sc && configured.has(sc));
}

/** @deprecated use isKycConfiguredForStore — kept for callers */
function isKycEnforcedForStore(storeCode) {
  return isKycConfiguredForStore(storeCode);
}

function getKycEnforcedStoreCodes() {
  return getKycConfiguredStoreCodes();
}

async function getGlobalKycSettings() {
  const row = await db.Setting.findOne({
    where: { key: KEY, distributorCode: null, storeCode: null },
    raw: true
  });
  const parsed = parseSettingsValue(row?.value);
  if (parsed) return { enabled: parsed.enabled !== false };
  return { ...DEFAULTS };
}

/**
 * Effective KYC on/off for a store.
 * Configured stores without a per-store row inherit the legacy global setting.
 */
async function getKycSettingsForStore(storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code || !isKycConfiguredForStore(code)) {
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

  const global = await getGlobalKycSettings();
  return {
    enabled: global.enabled !== false,
    configured: true,
    updatedBy: null,
    updatedAt: null,
    hasOverride: false
  };
}

/** @deprecated prefer getKycSettingsForStore — global legacy row */
async function getKycSettings() {
  return getGlobalKycSettings();
}

async function updateStoreKycSettings(storeCode, payload = {}, { updatedBy } = {}) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!isKycConfiguredForStore(code)) {
    const err = new Error(
      `KYC is not configured for store "${code}" yet. Add it to KYC_STORE_CODES and Didit credentials first.`
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

  // Resolve distributor from primary store admin when possible
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

/**
 * Legacy global update — still writes global row; prefer updateStoreKycSettings.
 */
async function updateKycSettings(payload = {}) {
  if (payload.storeCode) {
    return updateStoreKycSettings(payload.storeCode, payload, {
      updatedBy: payload.updatedBy
    });
  }
  const settings = {
    enabled: parseBoolEnabled(payload.enabled, true)
  };
  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode: null, storeCode: null },
    defaults: { key: KEY, distributorCode: null, storeCode: null, value: JSON.stringify(settings) }
  });
  await row.update({ value: JSON.stringify(settings) });
  return { ...settings };
}

async function listAllStoreKycSettings() {
  const cfg = getDiditConfig();
  const diditReady = Boolean(cfg.apiKey && cfg.workflowId);
  const configuredSet = getKycConfiguredStoreCodes();

  const [stores, settingRows, global] = await Promise.all([
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
    }),
    getGlobalKycSettings()
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
      // Inherit legacy global until an admin toggles this store
      enabled = global.enabled !== false;
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
    hasWorkflowId: Boolean(cfg.workflowId),
    hasWebhookSecret: Boolean(cfg.webhookSecret),
    apiBaseUrl: cfg.apiBaseUrl,
    enforcedStores: String(config.get('didit.storeCodes') || ''),
    storeScoped: Boolean(configuredSet)
  };
}

async function getKycSettingsAdminView() {
  return listAllStoreKycSettings();
}

/**
 * @param {string|null|undefined} storeCode — user's store
 */
async function isKycRequiredForWithdraw(storeCode) {
  const effective = await getKycSettingsForStore(storeCode);
  if (!effective.configured || !effective.enabled) return false;
  const cfg = getDiditConfig();
  return Boolean(cfg.apiKey && cfg.workflowId);
}

module.exports = {
  KEY,
  getKycSettings,
  getKycSettingsForStore,
  updateKycSettings,
  updateStoreKycSettings,
  getKycSettingsAdminView,
  listAllStoreKycSettings,
  isKycRequiredForWithdraw,
  isKycEnforcedForStore,
  isKycConfiguredForStore,
  getKycEnforcedStoreCodes,
  getKycConfiguredStoreCodes
};
