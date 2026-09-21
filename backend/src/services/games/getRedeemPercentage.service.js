'use strict';

const db = require('../../db/models');

const KEY = 'redeem_percentage';
const DEFAULT_REDEEM_PERCENTAGE = 15;

/**
 * Parse a stored setting value into a percentage in [0, 100], or null if invalid.
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

/**
 * Validate admin input for redeem win %.
 * @param {unknown} raw
 * @returns {number}
 */
function normalizePercentageInput(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    const err = new Error('Redeem percentage must be a number between 0 and 100.');
    err.statusCode = 400;
    throw err;
  }
  if (n < 0 || n > 100) {
    const err = new Error('Redeem percentage must be between 0 and 100.');
    err.statusCode = 400;
    throw err;
  }
  return Math.round(n * 100) / 100;
}

function normalizeScopeCodes(scope) {
  if (!scope) return { distributorCode: null, storeCode: null };
  const distributorCode =
    scope.distributorCode != null && String(scope.distributorCode).trim()
      ? String(scope.distributorCode).trim()
      : null;
  const storeCode =
    scope.storeCode != null && String(scope.storeCode).trim()
      ? String(scope.storeCode).trim()
      : null;
  return { distributorCode, storeCode };
}

async function readExact(distributorCode, storeCode, transaction) {
  const row = await db.Setting.findOne({
    where: {
      key: KEY,
      distributorCode: distributorCode ?? null,
      storeCode: storeCode ?? null
    },
    transaction: transaction || undefined
  });
  if (!row) return null;
  return parsePercentage(row.value);
}

/**
 * Resolve redeem win % for a scope.
 * Priority: store exact (dist+store) → store-code-only → distributor-only → global → built-in 15.
 *
 * @param {{ distributorCode?: string|null, storeCode?: string|null }|null} scope
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<{ percentage: number, isStoreOverride: boolean, source: 'store'|'distributor'|'global'|'default' }>}
 */
async function getRedeemPercentage(scope = null, options = {}) {
  const { transaction } = options;
  const { distributorCode: dist, storeCode: store } = normalizeScopeCodes(scope);

  if (store) {
    const exact = await readExact(dist, store, transaction);
    if (exact != null) {
      return { percentage: exact, isStoreOverride: true, source: 'store' };
    }
    // Rows saved with store_code only (distributor null)
    if (dist) {
      const storeOnly = await readExact(null, store, transaction);
      if (storeOnly != null) {
        return { percentage: storeOnly, isStoreOverride: true, source: 'store' };
      }
    }
  }

  if (dist) {
    const distPct = await readExact(dist, null, transaction);
    if (distPct != null) {
      return { percentage: distPct, isStoreOverride: false, source: 'distributor' };
    }
  }

  const globalPct = await readExact(null, null, transaction);
  if (globalPct != null) {
    return { percentage: globalPct, isStoreOverride: false, source: 'global' };
  }

  return {
    percentage: DEFAULT_REDEEM_PERCENTAGE,
    isStoreOverride: false,
    source: 'default'
  };
}

/**
 * Numeric % only (for redeem enforcement).
 * @param {{ distributorCode?: string|null, storeCode?: string|null }|null} scope
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<number>}
 */
async function getRedeemPercentageValue(scope = null, options = {}) {
  const { percentage } = await getRedeemPercentage(scope, options);
  return percentage;
}

/**
 * Upsert redeem % for global (scope null / empty) or a store (requires storeCode).
 * Does not clear other stores' overrides when updating global.
 * Does not create distributor-only rows.
 *
 * @param {unknown} percentage
 * @param {{ distributorCode?: string|null, storeCode?: string|null }|null} scope
 */
async function updateRedeemPercentage(percentage, scope = null) {
  const value = String(normalizePercentageInput(percentage));
  const { distributorCode, storeCode } = normalizeScopeCodes(scope);
  const isGlobal = !distributorCode && !storeCode;

  if (!isGlobal && !storeCode) {
    const err = new Error('storeCode is required to set a store redeem percentage.');
    err.statusCode = 400;
    throw err;
  }

  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value }
  });
  await row.update({ value });

  return getRedeemPercentage(isGlobal ? null : { distributorCode, storeCode });
}

/**
 * Remove store override so the store inherits global / default.
 * @param {{ distributorCode?: string|null, storeCode?: string|null }} scope
 */
async function resetRedeemPercentageToDefault(scope) {
  const { distributorCode, storeCode } = normalizeScopeCodes(scope);
  if (!storeCode) {
    const err = new Error('storeCode is required to reset redeem percentage.');
    err.statusCode = 400;
    throw err;
  }

  // Delete exact store row and any store-code-only row for this store
  await db.Setting.destroy({
    where: { key: KEY, distributorCode, storeCode }
  });
  if (distributorCode) {
    await db.Setting.destroy({
      where: { key: KEY, distributorCode: null, storeCode }
    });
  }

  return getRedeemPercentage({ distributorCode, storeCode });
}

/**
 * Master/tech staff: all stores with effective redeem win %.
 */
async function listStoreRedeemPercentages() {
  const { ROLES } = require('../../constants/roles');
  const { Op } = require('sequelize');

  const [stores, overrideRows, globalResult] = await Promise.all([
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
    }),
    getRedeemPercentage(null)
  ]);

  const overrideMap = new Map();
  for (const row of overrideRows || []) {
    const pct = parsePercentage(row.value);
    if (pct == null || !row.storeCode) continue;
    // Prefer exact dist|store key; also index store-only for lookup
    const exactKey = `${row.distributorCode || ''}|${row.storeCode || ''}`;
    overrideMap.set(exactKey, pct);
    if (!row.distributorCode) {
      overrideMap.set(`|${row.storeCode}`, pct);
    }
  }

  const platformPercentage = globalResult.percentage;

  return {
    platformPercentage,
    defaultPercentage: DEFAULT_REDEEM_PERCENTAGE,
    stores: (stores || []).map((s) => {
      const exactKey = `${s.distributorCode || ''}|${s.storeCode || ''}`;
      const storeOnlyKey = `|${s.storeCode || ''}`;
      const storePct = overrideMap.has(exactKey)
        ? overrideMap.get(exactKey)
        : (overrideMap.has(storeOnlyKey) ? overrideMap.get(storeOnlyKey) : null);
      const hasStoreOverride = storePct != null;
      return {
        userId: s.userId,
        username: s.username,
        email: s.email,
        distributorCode: s.distributorCode,
        storeCode: s.storeCode,
        isActive: s.isActive !== false,
        hasStoreOverride,
        storePercentage: hasStoreOverride ? storePct : null,
        effectivePercentage: hasStoreOverride ? storePct : platformPercentage,
        source: hasStoreOverride ? 'store' : globalResult.source
      };
    })
  };
}

module.exports = {
  KEY,
  DEFAULT_REDEEM_PERCENTAGE,
  getRedeemPercentage,
  getRedeemPercentageValue,
  updateRedeemPercentage,
  resetRedeemPercentageToDefault,
  listStoreRedeemPercentages,
  normalizePercentageInput
};
