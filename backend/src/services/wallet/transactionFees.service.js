'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { Op } = require('sequelize');

const PAYIN_FEE_KEY = 'payin_fee_percent';
const PAYOUT_FEE_KEY = 'payout_fee_percent';
const DEFAULT_FEE_PERCENT = 0;

function parsePercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function isCompletedStatus(status) {
  const s = String(status || '').toLowerCase().trim();
  return s === 'completed' || s === 'success' || s === 'paid';
}

function normalizePercentageInput(raw, label = 'Fee percentage') {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    const err = new Error(`${label} must be a number between 0 and 100.`);
    err.statusCode = 400;
    throw err;
  }
  if (n < 0 || n > 100) {
    const err = new Error(`${label} must be between 0 and 100.`);
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

async function readExact(key, distributorCode, storeCode, transaction) {
  const row = await db.Setting.findOne({
    where: {
      key,
      distributorCode: distributorCode ?? null,
      storeCode: storeCode ?? null
    },
    transaction: transaction || undefined
  });
  if (!row) return null;
  return parsePercentage(row.value);
}

async function resolvePercent(key, scope, options = {}) {
  const { transaction } = options;
  const { distributorCode: dist, storeCode: store } = normalizeScopeCodes(scope);

  if (store) {
    const exact = await readExact(key, dist, store, transaction);
    if (exact != null) {
      return { percentage: exact, isStoreOverride: true, source: 'store' };
    }
    if (dist) {
      const storeOnly = await readExact(key, null, store, transaction);
      if (storeOnly != null) {
        return { percentage: storeOnly, isStoreOverride: true, source: 'store' };
      }
    }
  }

  if (dist) {
    const distPct = await readExact(key, dist, null, transaction);
    if (distPct != null) {
      return { percentage: distPct, isStoreOverride: false, source: 'distributor' };
    }
  }

  const globalPct = await readExact(key, null, null, transaction);
  if (globalPct != null) {
    return { percentage: globalPct, isStoreOverride: false, source: 'global' };
  }

  return {
    percentage: DEFAULT_FEE_PERCENT,
    isStoreOverride: false,
    source: 'default'
  };
}

/**
 * Resolve payin + payout % for a store (or platform default when scope is empty).
 */
async function getTransactionFees(scope = null, options = {}) {
  const [payin, payout] = await Promise.all([
    resolvePercent(PAYIN_FEE_KEY, scope, options),
    resolvePercent(PAYOUT_FEE_KEY, scope, options)
  ]);
  return {
    payinPercent: payin.percentage,
    payoutPercent: payout.percentage,
    isStoreOverride: payin.isStoreOverride || payout.isStoreOverride,
    payinSource: payin.source,
    payoutSource: payout.source,
    source: payin.isStoreOverride || payout.isStoreOverride ? 'store' : payin.source
  };
}

async function upsertPercent(key, percentage, distributorCode, storeCode) {
  const value = String(percentage);
  const [row] = await db.Setting.findOrCreate({
    where: { key, distributorCode, storeCode },
    defaults: { key, distributorCode, storeCode, value }
  });
  await row.update({ value });
}

/**
 * Upsert payin/payout % for global (empty scope) or a store.
 */
async function updateTransactionFees(payload, scope = null) {
  const { distributorCode, storeCode } = normalizeScopeCodes(scope);
  const isGlobal = !distributorCode && !storeCode;

  if (!isGlobal && !storeCode) {
    const err = new Error('storeCode is required to set store transaction fees.');
    err.statusCode = 400;
    throw err;
  }

  const hasPayin = payload?.payinPercent !== undefined && payload?.payinPercent !== null && payload?.payinPercent !== '';
  const hasPayout = payload?.payoutPercent !== undefined && payload?.payoutPercent !== null && payload?.payoutPercent !== '';
  if (!hasPayin && !hasPayout) {
    const err = new Error('Provide payinPercent and/or payoutPercent (0–100).');
    err.statusCode = 400;
    throw err;
  }

  if (hasPayin) {
    await upsertPercent(
      PAYIN_FEE_KEY,
      normalizePercentageInput(payload.payinPercent, 'Payin fee percentage'),
      distributorCode,
      storeCode
    );
  }
  if (hasPayout) {
    await upsertPercent(
      PAYOUT_FEE_KEY,
      normalizePercentageInput(payload.payoutPercent, 'Payout fee percentage'),
      distributorCode,
      storeCode
    );
  }

  return getTransactionFees(isGlobal ? null : { distributorCode, storeCode });
}

async function resetTransactionFeesToDefault(scope) {
  const { distributorCode, storeCode } = normalizeScopeCodes(scope);
  if (!storeCode) {
    const err = new Error('storeCode is required to reset transaction fees.');
    err.statusCode = 400;
    throw err;
  }

  const whereExact = {
    key: { [Op.in]: [PAYIN_FEE_KEY, PAYOUT_FEE_KEY] },
    distributorCode,
    storeCode
  };
  await db.Setting.destroy({ where: whereExact });
  if (distributorCode) {
    await db.Setting.destroy({
      where: {
        key: { [Op.in]: [PAYIN_FEE_KEY, PAYOUT_FEE_KEY] },
        distributorCode: null,
        storeCode
      }
    });
  }

  return getTransactionFees({ distributorCode, storeCode });
}

function emptyFeePair() {
  return { payinPercent: null, payoutPercent: null };
}

function applyOverride(map, row, field) {
  const pct = parsePercentage(row.value);
  if (pct == null || !row.storeCode) return;
  const exactKey = `${row.distributorCode || ''}|${row.storeCode || ''}`;
  const current = map.get(exactKey) || emptyFeePair();
  current[field] = pct;
  map.set(exactKey, current);
  if (!row.distributorCode) {
    const storeOnlyKey = `|${row.storeCode}`;
    const storeCurrent = map.get(storeOnlyKey) || emptyFeePair();
    storeCurrent[field] = pct;
    map.set(storeOnlyKey, storeCurrent);
  }
}

function storeIdentityKey(distributorCode, storeCode) {
  return `${String(distributorCode || '').trim().toLowerCase()}|${String(storeCode || '').trim().toLowerCase()}`;
}

function preferCanonicalStoreRow(current, candidate) {
  if (!current) return candidate;
  const curActive = current.isActive !== false;
  const nextActive = candidate.isActive !== false;
  if (nextActive !== curActive) return nextActive ? candidate : current;
  const code = String(candidate.storeCode || '').trim().toLowerCase();
  const curName = String(current.username || '').trim().toLowerCase();
  const nextName = String(candidate.username || '').trim().toLowerCase();
  const curMatch = curName === code;
  const nextMatch = nextName === code;
  if (nextMatch !== curMatch) return nextMatch ? candidate : current;
  return Number(candidate.userId) < Number(current.userId) ? candidate : current;
}

function uniqueStoresByCode(stores) {
  const byKey = new Map();
  for (const row of stores || []) {
    const storeCode = row?.storeCode != null ? String(row.storeCode).trim() : '';
    if (!storeCode) continue;
    const key = storeIdentityKey(row.distributorCode, storeCode);
    byKey.set(key, preferCanonicalStoreRow(byKey.get(key), row));
  }
  return [...byKey.values()].sort((a, b) => {
    const dist = String(a.distributorCode || '').localeCompare(String(b.distributorCode || ''));
    if (dist !== 0) return dist;
    return String(a.storeCode || '').localeCompare(String(b.storeCode || ''));
  });
}

async function listStoreTransactionFees() {
  const [stores, overrideRows, globalResult] = await Promise.all([
    db.User.findAll({
      where: {
        role: ROLES.STORE_ADMIN,
        storeRoleId: null,
        deletedAt: null,
        storeCode: { [Op.ne]: null }
      },
      attributes: ['userId', 'username', 'email', 'distributorCode', 'storeCode', 'isActive'],
      order: [
        ['distributorCode', 'ASC'],
        ['storeCode', 'ASC'],
        ['userId', 'ASC']
      ],
      raw: true
    }),
    db.Setting.findAll({
      where: {
        key: { [Op.in]: [PAYIN_FEE_KEY, PAYOUT_FEE_KEY] },
        storeCode: { [Op.ne]: null }
      },
      attributes: ['key', 'distributorCode', 'storeCode', 'value'],
      raw: true
    }),
    getTransactionFees(null)
  ]);

  const overrideMap = new Map();
  for (const row of overrideRows || []) {
    if (row.key === PAYIN_FEE_KEY) applyOverride(overrideMap, row, 'payinPercent');
    if (row.key === PAYOUT_FEE_KEY) applyOverride(overrideMap, row, 'payoutPercent');
  }

  return {
    platformPayinPercent: globalResult.payinPercent,
    platformPayoutPercent: globalResult.payoutPercent,
    defaultPercent: DEFAULT_FEE_PERCENT,
    stores: uniqueStoresByCode(stores).map((s) => {
      const exactKey = `${s.distributorCode || ''}|${s.storeCode || ''}`;
      const storeOnlyKey = `|${s.storeCode || ''}`;
      const override = overrideMap.get(exactKey) || overrideMap.get(storeOnlyKey) || emptyFeePair();
      const hasPayinOverride = override.payinPercent != null;
      const hasPayoutOverride = override.payoutPercent != null;
      const hasStoreOverride = hasPayinOverride || hasPayoutOverride;
      const payinPercent = hasPayinOverride ? override.payinPercent : globalResult.payinPercent;
      const payoutPercent = hasPayoutOverride ? override.payoutPercent : globalResult.payoutPercent;
      return {
        userId: s.userId,
        username: s.username,
        email: s.email,
        distributorCode: s.distributorCode,
        storeCode: s.storeCode,
        isActive: s.isActive !== false,
        hasStoreOverride,
        hasPayinOverride,
        hasPayoutOverride,
        storePayinPercent: hasPayinOverride ? override.payinPercent : null,
        storePayoutPercent: hasPayoutOverride ? override.payoutPercent : null,
        payinPercent,
        payoutPercent,
        source: hasStoreOverride ? 'store' : globalResult.source
      };
    })
  };
}

/**
 * Load all fee settings for in-memory lookup (deposit list rows).
 */
async function loadTransactionFeeMap() {
  const rows = await db.Setting.findAll({
    where: { key: { [Op.in]: [PAYIN_FEE_KEY, PAYOUT_FEE_KEY] } },
    attributes: ['key', 'distributorCode', 'storeCode', 'value'],
    raw: true
  });

  const map = {
    global: { payinPercent: DEFAULT_FEE_PERCENT, payoutPercent: DEFAULT_FEE_PERCENT },
    byExact: new Map(),
    byStore: new Map()
  };

  for (const row of rows || []) {
    const pct = parsePercentage(row.value);
    if (pct == null) continue;
    const field = row.key === PAYOUT_FEE_KEY ? 'payoutPercent' : 'payinPercent';
    if (!row.storeCode && !row.distributorCode) {
      map.global[field] = pct;
      continue;
    }
    if (row.storeCode && !row.distributorCode) {
      const current = map.byStore.get(row.storeCode) || { payinPercent: null, payoutPercent: null };
      current[field] = pct;
      map.byStore.set(row.storeCode, current);
      continue;
    }
    if (row.storeCode) {
      const exactKey = `${row.distributorCode || ''}|${row.storeCode}`;
      const current = map.byExact.get(exactKey) || { payinPercent: null, payoutPercent: null };
      current[field] = pct;
      map.byExact.set(exactKey, current);
    }
  }

  return map;
}

function resolveFeesFromMap(distributorCode, storeCode, feeMap) {
  const fallback = feeMap?.global || { payinPercent: DEFAULT_FEE_PERCENT, payoutPercent: DEFAULT_FEE_PERCENT };
  const dist = distributorCode != null ? String(distributorCode).trim() : '';
  const store = storeCode != null ? String(storeCode).trim() : '';
  const exact = store ? feeMap?.byExact?.get(`${dist}|${store}`) : null;
  const storeOnly = store ? feeMap?.byStore?.get(store) : null;
  return {
    payinPercent: exact?.payinPercent ?? storeOnly?.payinPercent ?? fallback.payinPercent ?? DEFAULT_FEE_PERCENT,
    payoutPercent: exact?.payoutPercent ?? storeOnly?.payoutPercent ?? fallback.payoutPercent ?? DEFAULT_FEE_PERCENT
  };
}

function computeCompletedFee(amount, percent, status) {
  if (!isCompletedStatus(status)) return null;
  return roundMoney((Number(amount) || 0) * (Number(percent) || 0) / 100);
}

/**
 * SQL join to resolve store payin/payout % without duplicating rows.
 * @param {{ storeExpr: string, distExpr: string, kind: 'payin'|'payout', prefix?: string }} opts
 */
function buildStoreFeeJoinSql({ storeExpr, distExpr, kind = 'payin', prefix }) {
  const key = kind === 'payout' ? PAYOUT_FEE_KEY : PAYIN_FEE_KEY;
  const p = prefix || kind;
  return `
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN s.value ~ '^[0-9]+(\\.[0-9]+)?$' THEN LEAST(100, GREATEST(0, s.value::numeric))
        ELSE NULL
      END AS pct
      FROM settings s
      WHERE s.key = '${key}'
        AND s.store_code IS NOT DISTINCT FROM ${storeExpr}
        AND s.distributor_code IS NOT DISTINCT FROM ${distExpr}
      LIMIT 1
    ) ${p}_exact ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN s.value ~ '^[0-9]+(\\.[0-9]+)?$' THEN LEAST(100, GREATEST(0, s.value::numeric))
        ELSE NULL
      END AS pct
      FROM settings s
      WHERE s.key = '${key}'
        AND s.store_code IS NOT DISTINCT FROM ${storeExpr}
        AND s.distributor_code IS NULL
      LIMIT 1
    ) ${p}_store ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN s.value ~ '^[0-9]+(\\.[0-9]+)?$' THEN LEAST(100, GREATEST(0, s.value::numeric))
        ELSE NULL
      END AS pct
      FROM settings s
      WHERE s.key = '${key}'
        AND s.store_code IS NULL
        AND s.distributor_code IS NULL
      LIMIT 1
    ) ${p}_global ON TRUE
  `;
}

function storeFeePercentSql(prefix) {
  return `COALESCE(${prefix}_exact.pct, ${prefix}_store.pct, ${prefix}_global.pct, 0)`;
}

function completedFeeSql(amountExpr, completedPredicateSql, prefix) {
  return `(CASE WHEN (${completedPredicateSql}) THEN (${amountExpr})::numeric * ${storeFeePercentSql(prefix)} / 100.0 ELSE 0 END)`;
}

module.exports = {
  PAYIN_FEE_KEY,
  PAYOUT_FEE_KEY,
  DEFAULT_FEE_PERCENT,
  getTransactionFees,
  updateTransactionFees,
  resetTransactionFeesToDefault,
  listStoreTransactionFees,
  loadTransactionFeeMap,
  resolveFeesFromMap,
  computeCompletedFee,
  isCompletedStatus,
  roundMoney,
  buildStoreFeeJoinSql,
  storeFeePercentSql,
  completedFeeSql,
  normalizePercentageInput
};
