const db = require('../../db/models');
const { getCurrencySetting } = require('./getCurrencySetting.service');

const WALLET_LIMITS_KEY = 'wallet_limits';
const MAX_MONEY_LIMIT = 1000000;

const DEFAULTS = {
  depositMin: 10,
  depositMax: 5000,
  withdrawMin: 10,
  withdrawMax: 50,
  withdrawLimitHours: 24,
  /** null / 0 = unlimited (no daily cap) */
  dailyWithdrawMax: null
};

function clampPositiveMoney(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(v, MAX_MONEY_LIMIT);
}

function clampNonNegMoney(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.min(v, MAX_MONEY_LIMIT);
}

function parseDailyWithdrawMax(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Cap absurd values (DoS / overflow protection)
  const capped = Math.min(n, MAX_MONEY_LIMIT);
  return Math.round(capped * 100) / 100;
}

function parseLimitsValue(value) {
  const limits = {
    depositMin: DEFAULTS.depositMin,
    depositMax: DEFAULTS.depositMax,
    withdrawMin: DEFAULTS.withdrawMin,
    withdrawMax: DEFAULTS.withdrawMax,
    withdrawLimitHours: DEFAULTS.withdrawLimitHours,
    dailyWithdrawMax: DEFAULTS.dailyWithdrawMax
  };
  let metadata = { lastUpdatedBy: null, lastUpdatedAt: null };
  const present = {
    depositMin: false,
    depositMax: false,
    withdrawMin: false,
    withdrawMax: false,
    withdrawLimitHours: false,
    dailyWithdrawMax: false
  };
  if (!value) return { limits, metadata, present, hasDailyOverride: false };

  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_) {
    return { limits, metadata, present, hasDailyOverride: false };
  }
  if (!parsed || typeof parsed !== 'object') return { limits, metadata, present, hasDailyOverride: false };

  if (Object.prototype.hasOwnProperty.call(parsed, 'depositMin')) {
    present.depositMin = true;
    limits.depositMin = clampNonNegMoney(parsed.depositMin, DEFAULTS.depositMin);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'depositMax')) {
    present.depositMax = true;
    limits.depositMax = clampPositiveMoney(parsed.depositMax, DEFAULTS.depositMax);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'withdrawMin')) {
    present.withdrawMin = true;
    limits.withdrawMin = clampNonNegMoney(parsed.withdrawMin, DEFAULTS.withdrawMin);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'withdrawMax')) {
    present.withdrawMax = true;
    limits.withdrawMax = clampPositiveMoney(parsed.withdrawMax, DEFAULTS.withdrawMax);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'withdrawLimitHours')) {
    present.withdrawLimitHours = true;
    limits.withdrawLimitHours = Number(parsed.withdrawLimitHours) > 0 ? Number(parsed.withdrawLimitHours) : DEFAULTS.withdrawLimitHours;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'dailyWithdrawMax')) {
    present.dailyWithdrawMax = true;
    limits.dailyWithdrawMax = parseDailyWithdrawMax(parsed.dailyWithdrawMax);
  }
  metadata = {
    lastUpdatedBy: typeof parsed.lastUpdatedBy === 'string' ? parsed.lastUpdatedBy : null,
    lastUpdatedAt: parsed.lastUpdatedAt || null
  };
  return { limits, metadata, present, hasDailyOverride: present.dailyWithdrawMax };
}

function buildStoreOverridePayload(existingParsed, patch, metadata) {
  const out = { ...metadata };
  const srcLimits = existingParsed?.limits || {};
  const srcPresent = existingParsed?.present || {};

  // depositMin/depositMax are platform-only — never persist on store override rows.
  const fields = ['withdrawMin', 'withdrawMax', 'withdrawLimitHours', 'dailyWithdrawMax'];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      if (field === 'dailyWithdrawMax') {
        out.dailyWithdrawMax = parseDailyWithdrawMax(patch.dailyWithdrawMax);
      } else if (field === 'withdrawMin') {
        out[field] = clampNonNegMoney(patch[field], DEFAULTS[field]);
      } else {
        out[field] = clampPositiveMoney(patch[field], DEFAULTS[field]);
      }
    } else if (srcPresent[field]) {
      out[field] = srcLimits[field];
    }
  }
  return out;
}

async function readSettingRow(distributorCode, storeCode) {
  return db.Setting.findOne({
    where: {
      key: WALLET_LIMITS_KEY,
      distributorCode: distributorCode ?? null,
      storeCode: storeCode ?? null
    }
  });
}

/**
 * Platform-wide wallet limits (deposit/withdraw min-max). Used by deposit flows and admin global edit.
 * dailyWithdrawMax here is the global default only.
 */
async function getWalletLimits() {
  try {
    const [row, currency] = await Promise.all([
      readSettingRow(null, null),
      getCurrencySetting()
    ]);
    const { limits, metadata } = parseLimitsValue(row?.value);
    return { ...limits, ...metadata, currency };
  } catch (err) {
    const currency = await getCurrencySetting().catch(() => 'SC');
    return { ...DEFAULTS, lastUpdatedBy: null, lastUpdatedAt: null, currency };
  }
}

/**
 * Resolve effective wallet limits for a store scope.
 * Deposit min/max are always platform-wide (store rows cannot override them).
 * Withdraw per-request + dailyWithdrawMax: store override fields win when present.
 *
 * @param {{ distributorCode?: string|null, storeCode?: string|null }|null} scope
 */
async function getWalletLimitsForScope(scope = null) {
  try {
    const [globalRow, currency] = await Promise.all([
      readSettingRow(null, null),
      getCurrencySetting()
    ]);
    const globalParsed = parseLimitsValue(globalRow?.value);
    const result = {
      ...globalParsed.limits,
      ...globalParsed.metadata,
      currency,
      dailyWithdrawMaxSource: 'global',
      hasStoreAmountOverride: false,
      hasStoreDailyOverride: false
    };

    const hasStoreScope = scope && (scope.distributorCode != null || scope.storeCode != null);
    if (!hasStoreScope) return result;

    const storeRow = await readSettingRow(scope.distributorCode ?? null, scope.storeCode ?? null);
    if (!storeRow?.value) return result;

    const storeParsed = parseLimitsValue(storeRow.value);
    let touched = false;
    // Deposit limits stay platform-dynamic for every store.
    for (const field of ['withdrawMin', 'withdrawMax', 'withdrawLimitHours']) {
      if (storeParsed.present[field]) {
        result[field] = storeParsed.limits[field];
        touched = true;
      }
    }
    if (storeParsed.hasDailyOverride) {
      result.dailyWithdrawMax = storeParsed.limits.dailyWithdrawMax;
      result.dailyWithdrawMaxSource = 'store';
      result.hasStoreDailyOverride = true;
      touched = true;
    }
    if (touched) {
      result.hasStoreAmountOverride = storeParsed.present.withdrawMin || storeParsed.present.withdrawMax;
      if (storeParsed.metadata.lastUpdatedAt) {
        result.lastUpdatedBy = storeParsed.metadata.lastUpdatedBy;
        result.lastUpdatedAt = storeParsed.metadata.lastUpdatedAt;
      }
    }
    return result;
  } catch (err) {
    const currency = await getCurrencySetting().catch(() => 'SC');
    return {
      ...DEFAULTS,
      lastUpdatedBy: null,
      lastUpdatedAt: null,
      currency,
      dailyWithdrawMaxSource: 'global',
      hasStoreAmountOverride: false,
      hasStoreDailyOverride: false
    };
  }
}

/**
 * Resolve limits for a player (uses their distributorCode/storeCode for dailyWithdrawMax).
 * Never-deposited players are capped at 30 RSC; deposited players keep store min/max.
 */
async function getWalletLimitsForUser(userId) {
  const {
    hasCompletedCashDeposit,
    applyNeverDepositedWithdrawCap
  } = require('./neverDepositedWithdraw.service');
  if (!userId) {
    return applyNeverDepositedWithdrawCap(await getWalletLimitsForScope(null), false);
  }
  const user = await db.User.findByPk(userId, {
    attributes: ['distributorCode', 'storeCode'],
    raw: true
  });
  const scope =
    !user || (user.distributorCode == null && user.storeCode == null)
      ? null
      : {
          distributorCode: user.distributorCode ?? null,
          storeCode: user.storeCode ?? null
        };
  const limits = await getWalletLimitsForScope(scope);
  const neverDeposited = !(await hasCompletedCashDeposit(userId));
  return applyNeverDepositedWithdrawCap(limits, neverDeposited);
}

/**
 * Update global wallet limits (master admin). Preserves existing dailyWithdrawMax if omitted.
 */
async function updateWalletLimits(payload, options = {}) {
  const existing = await getWalletLimits();
  const limits = {
    depositMin: clampNonNegMoney(payload.depositMin, DEFAULTS.depositMin),
    depositMax: clampPositiveMoney(payload.depositMax, DEFAULTS.depositMax),
    withdrawMin: clampNonNegMoney(payload.withdrawMin, DEFAULTS.withdrawMin),
    withdrawMax: clampPositiveMoney(payload.withdrawMax, DEFAULTS.withdrawMax),
    withdrawLimitHours: Number(payload.withdrawLimitHours) > 0 ? Number(payload.withdrawLimitHours) : DEFAULTS.withdrawLimitHours,
    dailyWithdrawMax:
      payload.dailyWithdrawMax !== undefined
        ? parseDailyWithdrawMax(payload.dailyWithdrawMax)
        : parseDailyWithdrawMax(existing.dailyWithdrawMax)
  };
  const metadata = {
    lastUpdatedBy: options.updatedBy || null,
    lastUpdatedAt: new Date().toISOString()
  };
  const [row] = await db.Setting.findOrCreate({
    where: { key: WALLET_LIMITS_KEY, distributorCode: null, storeCode: null },
    defaults: { key: WALLET_LIMITS_KEY, distributorCode: null, storeCode: null, value: JSON.stringify(DEFAULTS) }
  });
  await row.update({ value: JSON.stringify({ ...limits, ...metadata }) });
  return { ...limits, ...metadata };
}

/**
 * Update wallet limits for a store (deposit/withdraw min-max + optional daily).
 * Only affects that store's players.
 */
async function updateStoreWalletLimits(payload, scope, options = {}) {
  const distributorCode = scope?.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope?.storeCode != null ? scope.storeCode : null;
  if (distributorCode == null && storeCode == null) {
    const err = new Error('Store scope is required.');
    err.statusCode = 400;
    throw err;
  }

  const existingRow = await readSettingRow(distributorCode, storeCode);
  const existingParsed = parseLimitsValue(existingRow?.value);
  const metadata = {
    lastUpdatedBy: options.updatedBy || null,
    lastUpdatedAt: new Date().toISOString()
  };

  const patch = {};
  // Ignore depositMin/depositMax — always inherited from platform for all stores.
  if (payload.withdrawMin !== undefined) patch.withdrawMin = payload.withdrawMin;
  if (payload.withdrawMax !== undefined) patch.withdrawMax = payload.withdrawMax;
  if (payload.dailyWithdrawMax !== undefined) patch.dailyWithdrawMax = payload.dailyWithdrawMax;

  const valueObj = buildStoreOverridePayload(existingParsed, patch, metadata);
  const value = JSON.stringify(valueObj);

  const [row] = await db.Setting.findOrCreate({
    where: { key: WALLET_LIMITS_KEY, distributorCode, storeCode },
    defaults: { key: WALLET_LIMITS_KEY, distributorCode, storeCode, value }
  });
  await row.update({ value });
  return getWalletLimitsForScope({ distributorCode, storeCode });
}

/**
 * Update daily withdrawal limit for a scope (store or global).
 * Store rows preserve any existing deposit/withdraw overrides.
 *
 * @param {number|null|string} dailyWithdrawMax - 0/null/empty = unlimited
 * @param {{ distributorCode?: string|null, storeCode?: string|null }|null} scope - null = global
 * @param {{ updatedBy?: string|null }} options
 */
async function updateDailyWithdrawMax(dailyWithdrawMax, scope = null, options = {}) {
  const distributorCode = scope?.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope?.storeCode != null ? scope.storeCode : null;
  const isStoreScope = distributorCode != null || storeCode != null;

  if (isStoreScope) {
    return updateStoreWalletLimits({ dailyWithdrawMax }, { distributorCode, storeCode }, options);
  }

  return updateWalletLimits({ ...(await getWalletLimits()), dailyWithdrawMax }, options);
}

/**
 * Remove a store's daily-limit override so the store inherits the platform daily default.
 * Keeps any store deposit/withdraw min-max overrides.
 */
async function clearStoreDailyWithdrawOverride(scope, options = {}) {
  const distributorCode = scope?.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope?.storeCode != null ? scope.storeCode : null;
  if (distributorCode == null && storeCode == null) {
    const err = new Error('Store scope is required to clear a store override.');
    err.statusCode = 400;
    throw err;
  }
  const row = await readSettingRow(distributorCode, storeCode);
  if (row?.value) {
    const parsed = parseLimitsValue(row.value);
    const metadata = {
      lastUpdatedBy: options.updatedBy || null,
      lastUpdatedAt: new Date().toISOString()
    };
    const kept = { ...metadata };
    for (const field of ['withdrawMin', 'withdrawMax', 'withdrawLimitHours']) {
      if (parsed.present[field]) kept[field] = parsed.limits[field];
    }
    const hasAmounts = parsed.present.withdrawMin || parsed.present.withdrawMax || parsed.present.withdrawLimitHours;
    if (hasAmounts) {
      await row.update({ value: JSON.stringify(kept) });
    } else {
      await row.destroy();
    }
  }
  const limits = await getWalletLimitsForScope({ distributorCode, storeCode });
  return {
    ...limits,
    cleared: true,
    lastUpdatedBy: options.updatedBy || null,
    lastUpdatedAt: new Date().toISOString()
  };
}

/**
 * List primary stores with their effective daily withdrawal limit (for master admin UI).
 */
async function listStoreDailyWithdrawLimits() {
  const { ROLES } = require('../../constants/roles');
  const { Op } = require('sequelize');

  const [stores, overrideRows, globalLimits, currency] = await Promise.all([
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
        key: WALLET_LIMITS_KEY,
        [Op.or]: [
          { distributorCode: { [Op.ne]: null } },
          { storeCode: { [Op.ne]: null } }
        ]
      },
      attributes: ['distributorCode', 'storeCode', 'value'],
      raw: true
    }),
    getWalletLimits(),
    getCurrencySetting().catch(() => 'SC')
  ]);

  const overrideMap = new Map();
  for (const row of overrideRows || []) {
    const key = `${row.distributorCode || ''}|${row.storeCode || ''}`;
    const parsed = parseLimitsValue(row.value);
    if (!parsed.hasDailyOverride) continue;
    overrideMap.set(key, {
      dailyWithdrawMax: parsed.limits.dailyWithdrawMax,
      lastUpdatedBy: parsed.metadata.lastUpdatedBy,
      lastUpdatedAt: parsed.metadata.lastUpdatedAt
    });
  }

  const platformDaily = parseDailyWithdrawMax(globalLimits.dailyWithdrawMax);

  return {
    currency: globalLimits.currency || currency,
    platformDailyWithdrawMax: platformDaily,
    stores: (stores || []).map((s) => {
      const key = `${s.distributorCode || ''}|${s.storeCode || ''}`;
      const override = overrideMap.get(key) || null;
      const hasStoreOverride = Boolean(override);
      const effectiveDaily =
        hasStoreOverride
          ? override.dailyWithdrawMax
          : platformDaily;
      return {
        userId: s.userId,
        username: s.username,
        email: s.email,
        distributorCode: s.distributorCode,
        storeCode: s.storeCode,
        isActive: s.isActive !== false,
        hasStoreOverride,
        storeDailyWithdrawMax: hasStoreOverride ? override.dailyWithdrawMax : null,
        effectiveDailyWithdrawMax: effectiveDaily,
        lastUpdatedBy: hasStoreOverride ? override.lastUpdatedBy : null,
        lastUpdatedAt: hasStoreOverride ? override.lastUpdatedAt : null
      };
    })
  };
}

module.exports = {
  getWalletLimits,
  getWalletLimitsForScope,
  getWalletLimitsForUser,
  updateWalletLimits,
  updateStoreWalletLimits,
  updateDailyWithdrawMax,
  clearStoreDailyWithdrawOverride,
  listStoreDailyWithdrawLimits,
  parseDailyWithdrawMax,
  DEFAULTS,
  WALLET_LIMITS_KEY
};
