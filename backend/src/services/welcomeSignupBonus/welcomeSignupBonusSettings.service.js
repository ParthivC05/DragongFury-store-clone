'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { createLogger } = require('../../libs/logger');
const { normalizeStoreCode } = require('../auth/storeBinding.helpers');

const log = createLogger('welcomeSignupBonusSettings');

const KEY = 'welcome_signup_bonus_settings';
const DEFAULT_AMOUNT_SC = 10;
const MAX_AMOUNT_SC = 10000;

const DEFAULTS = {
  enabled: false,
  amountSc: DEFAULT_AMOUNT_SC,
  modalImageUrl: null,
  // When true, users who received welcome/refer signup bonus must make a first
  // package purchase before playing. Missing field on existing rows => true.
  requireDepositToActivateBonus: true
};

/**
 * Validate optional landing welcome-bonus modal image URL.
 * Empty / null clears the override (storefront falls back to static asset).
 */
function normalizeModalImageUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    const err = new Error('modalImageUrl must be a string URL.');
    err.statusCode = 400;
    throw err;
  }
  const url = raw.trim();
  if (!url) return null;
  if (url.length > 2048) {
    const err = new Error('modalImageUrl is too long.');
    err.statusCode = 400;
    throw err;
  }
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error('modalImageUrl must be an http(s) URL.');
    err.statusCode = 400;
    throw err;
  }
  return url;
}

function roundAmountSc(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Validate and normalize amountSc. Throws with statusCode 400 on invalid input.
 * Allows 0..10000 with at most 2 decimal places (after rounding).
 */
function normalizeAmountSc(raw) {
  if (raw === undefined || raw === null || raw === '') {
    const err = new Error('amountSc is required.');
    err.statusCode = 400;
    throw err;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    const err = new Error('amountSc must be a number between 0 and 10000.');
    err.statusCode = 400;
    throw err;
  }
  if (n < 0) {
    const err = new Error('amountSc cannot be negative.');
    err.statusCode = 400;
    throw err;
  }
  if (n > MAX_AMOUNT_SC) {
    const err = new Error(`amountSc cannot exceed ${MAX_AMOUNT_SC}.`);
    err.statusCode = 400;
    throw err;
  }
  return roundAmountSc(n);
}

function normalizeEnabled(raw) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  const err = new Error('enabled must be a boolean.');
  err.statusCode = 400;
  throw err;
}

function parseSettingsValue(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    let amountSc = Number(parsed.amountSc);
    if (!Number.isFinite(amountSc) || amountSc < 0) amountSc = DEFAULT_AMOUNT_SC;
    if (amountSc > MAX_AMOUNT_SC) amountSc = MAX_AMOUNT_SC;
    amountSc = roundAmountSc(amountSc);
    const modalImageUrl =
      typeof parsed.modalImageUrl === 'string' && parsed.modalImageUrl.trim()
        ? parsed.modalImageUrl.trim()
        : null;
    return {
      enabled: parsed.enabled === true,
      amountSc,
      modalImageUrl,
      requireDepositToActivateBonus: parsed.requireDepositToActivateBonus !== false,
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    };
  } catch (_) {
    return null;
  }
}

function effectiveFromParsed(parsed) {
  if (!parsed) {
    return {
      enabled: DEFAULTS.enabled,
      amountSc: DEFAULTS.amountSc,
      modalImageUrl: DEFAULTS.modalImageUrl,
      requireDepositToActivateBonus: DEFAULTS.requireDepositToActivateBonus,
      hasOverride: false,
      updatedBy: null,
      updatedAt: null
    };
  }
  return {
    enabled: parsed.enabled === true,
    amountSc: parsed.amountSc,
    modalImageUrl: parsed.modalImageUrl || null,
    requireDepositToActivateBonus: parsed.requireDepositToActivateBonus !== false,
    hasOverride: true,
    updatedBy: parsed.updatedBy || null,
    updatedAt: parsed.updatedAt || null
  };
}

/**
 * Resolve store_admin primary account for a store code (optional distributor).
 */
async function resolveStoreScope({ distributorCode, storeCode } = {}) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const where = {
    role: ROLES.STORE_ADMIN,
    storeRoleId: null,
    storeCode: code
  };
  if (distributorCode != null && String(distributorCode).trim()) {
    where.distributorCode = String(distributorCode).trim();
  }
  const stores = await db.User.findAll({
    where,
    attributes: ['userId', 'distributorCode', 'storeCode', 'username', 'email', 'isActive'],
    raw: true,
    limit: 5
  });
  if (!stores.length) {
    const err = new Error('Store not found. Use a valid store code.');
    err.statusCode = 404;
    throw err;
  }
  if (stores.length > 1 && !(distributorCode != null && String(distributorCode).trim())) {
    const err = new Error('Multiple stores match this storeCode. Provide distributorCode as well.');
    err.statusCode = 400;
    throw err;
  }
  const store = stores[0];
  return {
    distributorCode: store.distributorCode ?? null,
    storeCode: store.storeCode,
    userId: store.userId,
    username: store.username,
    email: store.email,
    isActive: store.isActive !== false
  };
}

async function getSettingRow(distributorCode, storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) return null;

  if (distributorCode != null && String(distributorCode).trim()) {
    const exact = await db.Setting.findOne({
      where: {
        key: KEY,
        distributorCode: String(distributorCode).trim(),
        storeCode: code
      }
    });
    if (exact) return exact;
  }

  return db.Setting.findOne({
    where: { key: KEY, storeCode: code }
  });
}

/**
 * Effective welcome signup bonus for a distributor+store scope.
 * Missing row => enabled false, amountSc 10 (display default).
 */
async function getEffectiveSettings(distributorCode, storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    return { ...effectiveFromParsed(null), distributorCode: distributorCode ?? null, storeCode: null };
  }
  const row = await getSettingRow(distributorCode, storeCode);
  const parsed = parseSettingsValue(row?.value);
  return {
    ...effectiveFromParsed(parsed),
    distributorCode: row?.distributorCode ?? distributorCode ?? null,
    storeCode: code
  };
}

/**
 * Lookup by store code only (signup grant path). Resolves store_admin distributor when possible.
 */
async function getEffectiveSettingsForStoreCode(storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    return { ...effectiveFromParsed(null), distributorCode: null, storeCode: null };
  }

  let distributorCode = null;
  try {
    const scope = await resolveStoreScope({ storeCode: code });
    distributorCode = scope.distributorCode;
  } catch (_) {
    // Store admin row may be missing; still try settings by store_code alone.
  }

  return getEffectiveSettings(distributorCode, code);
}

/**
 * List all primary stores with welcome signup bonus settings (master / tech staff).
 */
async function listAllStoreSettings() {
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
      where: {
        key: KEY,
        storeCode: { [Op.ne]: null }
      },
      attributes: ['distributorCode', 'storeCode', 'value'],
      raw: true
    })
  ]);

  const settingsMap = new Map();
  for (const row of settingRows || []) {
    const mapKey = `${row.distributorCode || ''}|${normalizeStoreCode(row.storeCode)}`;
    settingsMap.set(mapKey, parseSettingsValue(row.value));
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

  return {
    stores: uniqueStores.map((s) => {
      const code = normalizeStoreCode(s.storeCode);
      const mapKey = `${s.distributorCode || ''}|${code}`;
      const parsed = settingsMap.get(mapKey) || null;
      const effective = effectiveFromParsed(parsed);
      return {
        userId: s.userId,
        username: s.username,
        email: s.email,
        distributorCode: s.distributorCode,
        storeCode: s.storeCode,
        isActive: s.isActive !== false,
        enabled: effective.enabled,
        amountSc: effective.amountSc,
        modalImageUrl: effective.modalImageUrl,
        requireDepositToActivateBonus: effective.requireDepositToActivateBonus !== false,
        hasOverride: effective.hasOverride,
        updatedBy: effective.updatedBy,
        updatedAt: effective.updatedAt
      };
    })
  };
}

/**
 * Single-store view for store admin.
 */
async function listOwnStoreSettings(scope) {
  if (!scope?.storeCode) {
    const err = new Error('Store scope is required.');
    err.statusCode = 400;
    throw err;
  }
  const store = await resolveStoreScope(scope);
  const effective = await getEffectiveSettings(store.distributorCode, store.storeCode);
  return {
    stores: [
      {
        userId: store.userId,
        username: store.username,
        email: store.email,
        distributorCode: store.distributorCode,
        storeCode: store.storeCode,
        isActive: store.isActive,
        enabled: effective.enabled,
        amountSc: effective.amountSc,
        modalImageUrl: effective.modalImageUrl,
        requireDepositToActivateBonus: effective.requireDepositToActivateBonus !== false,
        hasOverride: effective.hasOverride,
        updatedBy: effective.updatedBy,
        updatedAt: effective.updatedAt
      }
    ]
  };
}

/**
 * Public landing payload for first-scroll welcome bonus modal.
 */
async function getPublicSettingsForStoreCode(storeCode) {
  const effective = await getEffectiveSettingsForStoreCode(storeCode);
  return {
    enabled: effective.enabled === true,
    amountSc: effective.amountSc,
    modalImageUrl: effective.modalImageUrl || null
  };
}

/**
 * Upsert per-store welcome signup bonus settings.
 */
async function upsertStoreSettings(scope, payload, { updatedBy } = {}) {
  const store = await resolveStoreScope(scope);
  const enabled = normalizeEnabled(payload.enabled);
  const amountSc = normalizeAmountSc(payload.amountSc);
  if (enabled && !(amountSc > 0)) {
    const err = new Error('When enabled, amountSc must be greater than 0.');
    err.statusCode = 400;
    throw err;
  }

  const previous = await getEffectiveSettings(store.distributorCode, store.storeCode);
  const normalizedImage = normalizeModalImageUrl(payload.modalImageUrl);
  const modalImageUrl =
    normalizedImage === undefined ? previous.modalImageUrl || null : normalizedImage;

  const requireDepositToActivateBonus =
    payload.requireDepositToActivateBonus === undefined
      ? previous.requireDepositToActivateBonus !== false
      : normalizeEnabled(payload.requireDepositToActivateBonus);

  const updatedAt = new Date().toISOString();
  const valueObj = {
    enabled,
    amountSc,
    modalImageUrl,
    requireDepositToActivateBonus,
    updatedBy: updatedBy || null,
    updatedAt
  };

  const [row] = await db.Setting.findOrCreate({
    where: {
      key: KEY,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    },
    defaults: {
      key: KEY,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode,
      value: JSON.stringify(valueObj)
    }
  });
  await row.update({ value: JSON.stringify(valueObj) });

  log.info('Welcome signup bonus settings updated', {
    storeCode: store.storeCode,
    distributorCode: store.distributorCode,
    updatedBy: updatedBy || null,
    previous: {
      enabled: previous.enabled,
      amountSc: previous.amountSc,
      modalImageUrl: previous.modalImageUrl || null,
      requireDepositToActivateBonus: previous.requireDepositToActivateBonus !== false
    },
    next: { enabled, amountSc, modalImageUrl, requireDepositToActivateBonus }
  });

  return {
    distributorCode: store.distributorCode,
    storeCode: store.storeCode,
    enabled,
    amountSc,
    modalImageUrl,
    requireDepositToActivateBonus,
    hasOverride: true,
    updatedBy: updatedBy || null,
    updatedAt
  };
}

/**
 * Whether the activate welcome/refer bonus deposit modal + play gate is on for a store.
 * Missing setting => true (current default behavior).
 */
async function isRequireDepositToActivateBonusEnabled(distributorCode, storeCode) {
  const effective = await getEffectiveSettings(distributorCode, storeCode);
  return effective.requireDepositToActivateBonus !== false;
}

/**
 * Toggle only the activate-bonus play popup, without changing bonus amount/image.
 */
async function upsertActivateBonusModal(scope, enabledRaw, { updatedBy } = {}) {
  const store = await resolveStoreScope(scope);
  const requireDepositToActivateBonus = normalizeEnabled(enabledRaw);
  const previous = await getEffectiveSettings(store.distributorCode, store.storeCode);
  const updatedAt = new Date().toISOString();
  const valueObj = {
    enabled: previous.enabled === true,
    amountSc: previous.amountSc,
    modalImageUrl: previous.modalImageUrl || null,
    requireDepositToActivateBonus,
    updatedBy: updatedBy || null,
    updatedAt
  };

  const [row] = await db.Setting.findOrCreate({
    where: {
      key: KEY,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    },
    defaults: {
      key: KEY,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode,
      value: JSON.stringify(valueObj)
    }
  });
  await row.update({ value: JSON.stringify(valueObj) });

  log.info('Activate bonus modal setting updated', {
    storeCode: store.storeCode,
    distributorCode: store.distributorCode,
    updatedBy: updatedBy || null,
    previous: previous.requireDepositToActivateBonus !== false,
    next: requireDepositToActivateBonus
  });

  return {
    distributorCode: store.distributorCode,
    storeCode: store.storeCode,
    requireDepositToActivateBonus,
    hasOverride: true,
    updatedBy: updatedBy || null,
    updatedAt
  };
}

module.exports = {
  KEY,
  DEFAULTS,
  DEFAULT_AMOUNT_SC,
  MAX_AMOUNT_SC,
  normalizeAmountSc,
  normalizeEnabled,
  normalizeModalImageUrl,
  getEffectiveSettings,
  getEffectiveSettingsForStoreCode,
  getPublicSettingsForStoreCode,
  isRequireDepositToActivateBonusEnabled,
  listAllStoreSettings,
  listOwnStoreSettings,
  upsertStoreSettings,
  upsertActivateBonusModal,
  resolveStoreScope
};
