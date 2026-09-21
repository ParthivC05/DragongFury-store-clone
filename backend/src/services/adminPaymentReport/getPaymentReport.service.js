'use strict';

const db = require('../../db/models');
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { getPaymentTypeLabel, PAYMENT_TYPE_KEYS } = require('../../constants/paymentTypes');
const { getPaymentProviderDisplayLabel } = require('../../constants/paymentProviderLabels');
const {
  toDateRangeStart,
  toDateRangeEnd,
  toDateTimeRangeStart,
  toDateTimeRangeEnd
} = require('../../utils/dateRangeFilters');
const { getPaymentReportGameFlow } = require('./getPaymentReportGameFlow.service');

const DEPOSIT_REQUEST_V2_DEDUPE_SQL = `
  AND NOT EXISTS (
    SELECT 1
    FROM deposit_orders dpo_v2
    WHERE dpo_v2.user_id = dr.user_id
      AND dpo_v2.provider_transaction_id IS NOT NULL
      AND dr.provider_transaction_id IS NOT NULL
      AND TRIM(dpo_v2.provider_transaction_id) = TRIM(dr.provider_transaction_id)
      AND (dpo_v2.metadata IS NULL OR NOT (dpo_v2.metadata ? 'legacyDepositRequestId'))
  )
`;

const DEPOSIT_REQUEST_CHIME_DEDUPE_SQL = `
  AND LOWER(COALESCE(dr.provider, '')) <> 'manual-chime-deposit'
`;

const PENDING_DEPOSIT_DEDUPE_SQL = `
  AND LOWER(COALESCE(ppd.status, '')) IN ('pending', 'confirming')
  AND LOWER(COALESCE(ppd.provider, '')) IN ('dollarpay', 'xxpay', 'selfcrypto')
  AND NOT EXISTS (
    SELECT 1
    FROM deposit_orders dpo_ppd
    WHERE dpo_ppd.user_id = ppd.user_id
      AND (
        (
          dpo_ppd.payment_link_token IS NOT NULL
          AND ppd.provider_session_id IS NOT NULL
          AND TRIM(dpo_ppd.payment_link_token) = TRIM(ppd.provider_session_id)
        )
        OR (
          dpo_ppd.metadata IS NOT NULL
          AND (dpo_ppd.metadata->>'legacyPaymentPendingDepositId') = ppd.id::text
        )
      )
  )
`;

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function normalizeTime(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || s === 'undefined') return '';
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

function resolveDateRange(startDate, endDate, timezoneOffset = null, startTime = null, endTime = null) {
  const normalizedStart =
    startDate && String(startDate).trim() && String(startDate).trim() !== 'undefined'
      ? String(startDate).trim()
      : null;
  const normalizedEnd =
    endDate && String(endDate).trim() && String(endDate).trim() !== 'undefined'
      ? String(endDate).trim()
      : null;
  const defaults = defaultDateRange();
  let rangeStart = normalizedStart || defaults.startDate;
  let rangeEnd = normalizedEnd || defaults.endDate;
  if (rangeStart > rangeEnd) {
    const swap = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = swap;
  }
  const startTimeStr = normalizeTime(startTime);
  const endTimeStr = normalizeTime(endTime);
  const from = startTimeStr
    ? toDateTimeRangeStart(rangeStart, startTimeStr, timezoneOffset)
    : toDateRangeStart(rangeStart, timezoneOffset);
  const to = endTimeStr
    ? toDateTimeRangeEnd(rangeEnd, endTimeStr, timezoneOffset)
    : toDateRangeEnd(rangeEnd, timezoneOffset);
  return {
    rangeStart,
    rangeEnd,
    startTime: startTimeStr || null,
    endTime: endTimeStr || null,
    from,
    to
  };
}

function calcRate(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function providerDisplayLabel(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (!key) return 'Unknown';
  if (key === 'orionstarspay') return 'OrionStarPay';
  if (key === 'dollarpay' || key === 'xxpay') return getPaymentProviderDisplayLabel(key);
  if (key === 'chime') return 'Manual Chime';
  if (key === 'scrypto') return 'Crypto';
  if (key === 'selfcrypto') return 'Direct Crypto';
  if (key === 'speed') return 'Speed';
  return provider;
}

function normalizeProviderKey(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return 'unknown';
  if (key === 'orion' || key === 'orionstars' || key === 'orionstars_pay') return 'orionstarspay';
  if (key === 'dollarpaywallet' || key === 'dollar_pay') return 'dollarpay';
  if (key === 'xx_pay') return 'xxpay';
  if (key === 'manual' || key === 'manual_chime' || key === 'manual-chime') return 'chime';
  return key.slice(0, 64);
}

function normalizeMethodKey(raw) {
  if (raw == null) return 'unknown';
  let key = String(raw).trim().toLowerCase();
  if (!key) return 'unknown';
  if (key === 'apple pay') key = 'apple_pay';
  if (key === 'google pay') key = 'google_pay';
  if (key === 'credit_card' || key === 'debit_card') key = 'card';
  if (key === 'payment' || key === 'orionstarspay') key = 'card';
  if (key === 'scrypto') key = 'crypto';
  if (key === 'selfcrypto') key = 'crypto';
  return key.slice(0, 64);
}

function methodDisplayLabel(method, provider) {
  const key = normalizeMethodKey(method);
  const providerKey = normalizeProviderKey(provider);
  if (providerKey === 'chime' || key === 'chime') return 'Chime';
  if (key === 'unknown') {
    if (providerKey === 'dollarpay' || providerKey === 'xxpay') {
      return getPaymentProviderDisplayLabel(providerKey);
    }
    if (providerKey === 'orionstarspay') return 'Card';
    return 'Unknown';
  }
  return getPaymentTypeLabel(key) || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildStoreScopeSql(storeCode, replacements) {
  const sc = storeCode && String(storeCode).trim();
  if (!sc) return '';
  replacements.filterStoreCode = sc;
  return 'AND u.store_code = :filterStoreCode';
}

/**
 * Deposit pay amount — same fields as Payment totals (dashboard).
 * Use requested/order amount, not provider-event net (Orion events can differ by fees).
 */
function buildAttemptsUnionSql(storeScopeSql) {
  return `
    SELECT
      LOWER(COALESCE(NULLIF(TRIM(dpo.provider), ''), 'unknown')) AS provider_raw,
      COALESCE(
        dpo.metadata->>'selectedDepositMethod',
        dpo.metadata->>'paymentType',
        dpo.metadata->>'paymentMethod',
        CASE
          WHEN jsonb_typeof(dpo.metadata->'acceptedPaymentOptions') = 'array'
            THEN dpo.metadata->'acceptedPaymentOptions'->>0
          ELSE dpo.metadata->>'acceptedPaymentOptions'
        END,
        CASE WHEN LOWER(COALESCE(dpo.provider, '')) IN ('scrypto', 'selfcrypto') THEN 'crypto' ELSE NULL END,
        CASE WHEN LOWER(COALESCE(dpo.provider, '')) = 'chime' THEN 'chime' ELSE NULL END,
        'card'
      ) AS method_raw,
      CASE
        WHEN UPPER(COALESCE(dpo.status, '')) IN ('SUCCESS', 'COMPLETED') THEN 'completed'
        WHEN UPPER(COALESCE(dpo.status, '')) IN ('PENDING', 'LINK_CREATED') THEN 'pending'
        WHEN UPPER(COALESCE(dpo.status, '')) = 'EXPIRED' THEN 'expired'
        WHEN UPPER(COALESCE(dpo.status, '')) = 'FAILED' THEN 'failed'
        WHEN UPPER(COALESCE(dpo.status, '')) = 'CLOSED' THEN 'closed'
        ELSE LOWER(COALESCE(dpo.status, 'pending'))
      END AS status_key,
      dpo.requested_amount::numeric AS amount
    FROM deposit_orders dpo
    INNER JOIN users u ON u.user_id = dpo.user_id
    WHERE u.role = '${ROLES.USER}'
      AND (dpo.metadata IS NULL OR NOT (dpo.metadata ? 'legacyDepositRequestId'))
      AND dpo.created_at >= :from
      AND dpo.created_at <= :to
      ${storeScopeSql}

    UNION ALL

    SELECT
      LOWER(COALESCE(NULLIF(TRIM(dr.provider), ''), 'unknown')),
      COALESCE(NULLIF(TRIM(dr.method), ''), 'card'),
      CASE
        WHEN LOWER(COALESCE(dr.status, '')) IN ('completed', 'success') THEN 'completed'
        WHEN LOWER(COALESCE(dr.status, '')) IN ('pending', 'processing', 'confirming') THEN 'pending'
        WHEN LOWER(COALESCE(dr.status, '')) = 'expired' THEN 'expired'
        WHEN LOWER(COALESCE(dr.status, '')) = 'failed' THEN 'failed'
        WHEN LOWER(COALESCE(dr.status, '')) = 'rejected' THEN 'rejected'
        WHEN LOWER(COALESCE(dr.status, '')) = 'closed' THEN 'closed'
        ELSE LOWER(COALESCE(dr.status, 'pending'))
      END,
      dr.amount::numeric
    FROM deposit_requests dr
    INNER JOIN users u ON u.user_id = dr.user_id
    WHERE u.role = '${ROLES.USER}'
      AND dr.created_at >= :from
      AND dr.created_at <= :to
      ${storeScopeSql}
      ${DEPOSIT_REQUEST_V2_DEDUPE_SQL}
      ${DEPOSIT_REQUEST_CHIME_DEDUPE_SQL}

    UNION ALL

    SELECT
      'chime'::text,
      'chime'::text,
      CASE
        WHEN LOWER(COALESCE(cdr.status, '')) IN ('completed', 'success') THEN 'completed'
        WHEN LOWER(COALESCE(cdr.status, '')) IN ('pending', 'processing') THEN 'pending'
        WHEN LOWER(COALESCE(cdr.status, '')) = 'expired' THEN 'expired'
        WHEN LOWER(COALESCE(cdr.status, '')) = 'failed' THEN 'failed'
        WHEN LOWER(COALESCE(cdr.status, '')) = 'rejected' THEN 'rejected'
        ELSE LOWER(COALESCE(cdr.status, 'pending'))
      END,
      cdr.amount::numeric
    FROM chime_deposit_requests cdr
    INNER JOIN users u ON u.user_id = cdr.user_id
    WHERE u.role = '${ROLES.USER}'
      AND cdr.created_at >= :from
      AND cdr.created_at <= :to
      ${storeScopeSql}

    UNION ALL

    SELECT
      LOWER(COALESCE(NULLIF(TRIM(ppd.provider), ''), 'unknown')),
      COALESCE(
        ppd.provider_metadata->>'paymentType',
        ppd.provider_metadata->>'paymentMethod',
        ppd.provider,
        'card'
      ),
      'pending'::text,
      ppd.amount::numeric
    FROM payment_pending_deposits ppd
    INNER JOIN users u ON u.user_id = ppd.user_id
    WHERE u.role = '${ROLES.USER}'
      AND ppd.created_at >= :from
      AND ppd.created_at <= :to
      ${storeScopeSql}
      ${PENDING_DEPOSIT_DEDUPE_SQL}
  `;
}

function emptyBucket() {
  return {
    total: 0,
    success: 0,
    failed: 0,
    rejected: 0,
    pending: 0,
    expired: 0,
    closed: 0,
    other: 0,
    successAmount: 0,
    failedAmount: 0,
    rejectedAmount: 0,
    pendingAmount: 0,
    expiredAmount: 0,
    totalAmount: 0,
    successRate: 0,
    failureRate: 0,
    rejectedRate: 0,
    settledTotal: 0,
    settledSuccessRate: 0,
    settledFailureRate: 0,
    settledRejectedRate: 0
  };
}

function accumulate(bucket, statusKey, amount) {
  const amt = Number(amount) || 0;
  bucket.total += 1;
  bucket.totalAmount += amt;
  if (statusKey === 'completed') {
    bucket.success += 1;
    bucket.successAmount += amt;
  } else if (statusKey === 'failed') {
    bucket.failed += 1;
    bucket.failedAmount += amt;
  } else if (statusKey === 'rejected') {
    bucket.rejected += 1;
    bucket.rejectedAmount += amt;
  } else if (statusKey === 'pending') {
    bucket.pending += 1;
    bucket.pendingAmount += amt;
  } else if (statusKey === 'expired') {
    bucket.expired += 1;
    bucket.expiredAmount += amt;
  } else if (statusKey === 'closed') {
    bucket.closed += 1;
  } else {
    bucket.other += 1;
  }
}

function finalizeRates(bucket) {
  // Rates vs all attempts (includes pending/expired).
  bucket.successRate = calcRate(bucket.success, bucket.total);
  bucket.failureRate = calcRate(bucket.failed, bucket.total);
  bucket.rejectedRate = calcRate(bucket.rejected, bucket.total);
  // Settled rates ignore in-progress payments (easier to read).
  const settled = bucket.success + bucket.failed + bucket.rejected;
  bucket.settledTotal = settled;
  bucket.settledSuccessRate = calcRate(bucket.success, settled);
  bucket.settledFailureRate = calcRate(bucket.failed, settled);
  bucket.settledRejectedRate = calcRate(bucket.rejected, settled);
  bucket.successAmount = Math.round(bucket.successAmount * 100) / 100;
  bucket.failedAmount = Math.round(bucket.failedAmount * 100) / 100;
  bucket.rejectedAmount = Math.round(bucket.rejectedAmount * 100) / 100;
  bucket.pendingAmount = Math.round(bucket.pendingAmount * 100) / 100;
  bucket.expiredAmount = Math.round(bucket.expiredAmount * 100) / 100;
  bucket.totalAmount = Math.round(bucket.totalAmount * 100) / 100;
  return bucket;
}

async function fetchAttemptRows({
  startDate,
  endDate,
  storeCode,
  timezoneOffset = null,
  startTime = null,
  endTime = null
}) {
  const { from, to, rangeStart, rangeEnd } = resolveDateRange(
    startDate,
    endDate,
    timezoneOffset,
    startTime,
    endTime
  );
  if (!from || !to) {
    return { rows: [], rangeStart, rangeEnd };
  }
  const replacements = { from, to };
  const storeScopeSql = buildStoreScopeSql(storeCode, replacements);
  const sql = `
    SELECT provider_raw, method_raw, status_key, amount
    FROM (
      ${buildAttemptsUnionSql(storeScopeSql)}
    ) AS attempts
  `;
  const rows = await db.sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT
  });
  return { rows: rows || [], rangeStart, rangeEnd };
}

/**
 * Summary + by-provider (with nested methods) + flat by-method breakdown.
 */
async function getPaymentReport({
  startDate,
  endDate,
  storeCode,
  timezoneOffset = null,
  startTime = null,
  endTime = null
}) {
  const { from, to, rangeStart, rangeEnd } = resolveDateRange(
    startDate,
    endDate,
    timezoneOffset,
    startTime,
    endTime
  );
  const { rows } = await fetchAttemptRows({
    startDate,
    endDate,
    storeCode,
    timezoneOffset,
    startTime,
    endTime
  });

  const summary = emptyBucket();
  const byProviderMap = new Map();
  const byMethodMap = new Map();

  for (const row of rows) {
    const provider = normalizeProviderKey(row.provider_raw);
    const method = normalizeMethodKey(row.method_raw);
    const statusKey = String(row.status_key || 'pending').toLowerCase();
    const amount = row.amount;

    accumulate(summary, statusKey, amount);

    if (!byProviderMap.has(provider)) {
      byProviderMap.set(provider, {
        provider,
        label: providerDisplayLabel(provider),
        ...emptyBucket(),
        _methods: new Map()
      });
    }
    const providerBucket = byProviderMap.get(provider);
    accumulate(providerBucket, statusKey, amount);

    if (!providerBucket._methods.has(method)) {
      providerBucket._methods.set(method, {
        method,
        label: methodDisplayLabel(method, provider),
        ...emptyBucket()
      });
    }
    accumulate(providerBucket._methods.get(method), statusKey, amount);

    if (!byMethodMap.has(method)) {
      byMethodMap.set(method, {
        method,
        label: methodDisplayLabel(method, provider),
        ...emptyBucket()
      });
    }
    accumulate(byMethodMap.get(method), statusKey, amount);
  }

  function sortBuckets(a, b) {
    if (b.total !== a.total) return b.total - a.total;
    if (b.successAmount !== a.successAmount) return b.successAmount - a.successAmount;
    return (a.label || '').localeCompare(b.label || '');
  }

  const byProvider = [...byProviderMap.values()]
    .map((bucket) => {
      const methods = [...(bucket._methods?.values() || [])]
        .map((m) => {
          finalizeRates(m);
          if (!m.label || m.label === 'Unknown') m.label = methodDisplayLabel(m.method, bucket.provider);
          return m;
        })
        .sort(sortBuckets);
      delete bucket._methods;
      finalizeRates(bucket);
      bucket.methods = methods;
      return bucket;
    })
    .sort(sortBuckets);

  const byMethod = [...byMethodMap.values()]
    .map((bucket) => {
      finalizeRates(bucket);
      if (bucket.label === 'Unknown' || !bucket.label) {
        bucket.label = methodDisplayLabel(bucket.method);
      }
      return bucket;
    })
    .sort(sortBuckets);

  let gameFlow = {
    purchase: { paidAmount: 0, scGiven: 0, extraSc: 0, uniqueUsers: 0 },
    totals: {
      depositedSc: 0,
      withdrawnSc: 0,
      stillInGameSc: 0,
      stillInWalletSc: 0,
      depositUsers: 0,
      withdrawUsers: 0
    },
    groups: []
  };
  try {
    gameFlow = await getPaymentReportGameFlow({ from, to, storeCode });
  } catch (_) {
    /* keep payment-provider stats even if game-flow tables are unavailable */
  }

  return {
    rangeStart,
    rangeEnd,
    summary: finalizeRates(summary),
    byProvider,
    byMethod,
    gameFlow
  };
}

async function getPaymentReportFilterOptions() {
  const storeRows = await db.User.findAll({
    where: { role: ROLES.STORE_ADMIN },
    attributes: ['storeCode'],
    raw: true
  });
  const storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();

  const methodOptions = PAYMENT_TYPE_KEYS.map((key) => ({
    value: key,
    label: getPaymentTypeLabel(key)
  }));

  const providerOptions = [
    { value: 'orionstarspay', label: 'OrionStarPay' },
    { value: 'dollarpay', label: 'Dpay' },
    { value: 'xxpay', label: 'Xpay' },
    { value: 'chime', label: 'Manual Chime' },
    { value: 'scrypto', label: 'Crypto' },
    { value: 'selfcrypto', label: 'Direct Crypto' },
    { value: 'speed', label: 'Speed' }
  ];

  return { storeCodes, methodOptions, providerOptions };
}

module.exports = {
  getPaymentReport,
  getPaymentReportFilterOptions,
  calcRate,
  providerDisplayLabel,
  methodDisplayLabel
};
