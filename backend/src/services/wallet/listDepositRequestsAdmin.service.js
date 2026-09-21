'use strict';

const db = require('../../db/models');
const { QueryTypes, Op } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { getPaymentTypeLabel } = require('../../constants/paymentTypes');
const { buildDateTimeRangeFilterParts } = require('../../utils/dateRangeFilters');
const { stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');
const { getPaymentProviderDisplayLabel } = require('../../constants/paymentProviderLabels');
const {
  loadTransactionFeeMap,
  resolveFeesFromMap,
  computeCompletedFee,
  buildStoreFeeJoinSql,
  completedFeeSql
} = require('./transactionFees.service');

function methodDisplayLabel(method, provider) {
  const key = (method || '').toString().toLowerCase().trim();
  const providerKey = (provider || '').toString().toLowerCase().trim();
  if (providerKey === 'chime' || key === 'chime') return 'Chime';
  if (providerKey === 'selfcrypto' || key === 'selfcrypto') return 'Direct Crypto';
  if (providerKey === 'dollarpay' || providerKey === 'xxpay') {
    return getPaymentTypeLabel(key) || getPaymentProviderDisplayLabel(providerKey);
  }
  const label = getPaymentTypeLabel(key);
  if (label) return label;
  if (providerKey === 'scrypto' || key === 'scrypto') return 'Crypto';
  if (providerKey === 'orionstarspay' || key === 'orionstarspay' || key === 'payment') return 'Card';
  return key || '—';
}

function normalizeMethodKey(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (key === 'apple pay') return 'apple_pay';
  if (key === 'google pay') return 'google_pay';
  return key;
}

/** Admin method filter aliases (card includes Orion “payment” / blank card rows). */
const METHOD_FILTER_ALIASES = {
  card: ['card', 'credit_card', 'debit_card', 'payment'],
  cashapp: ['cashapp', 'ecashapp'],
  apple_pay: ['apple_pay', 'applepay', 'apple pay'],
  google_pay: ['google_pay', 'googlepay', 'google pay'],
  chime: ['chime'],
  crypto: ['crypto', 'scrypto', 'selfcrypto']
};

const DEPOSIT_ORDER_METHOD_EXPR = `COALESCE(
  dpo.metadata->>'selectedDepositMethod',
  dpo.metadata->>'paymentType',
  dpo.metadata->>'paymentMethod',
  CASE
    WHEN jsonb_typeof(dpo.metadata->'acceptedPaymentOptions') = 'array' THEN dpo.metadata->'acceptedPaymentOptions'->>0
    ELSE dpo.metadata->>'acceptedPaymentOptions'
  END
)`;

const PENDING_DEPOSIT_METHOD_EXPR = `COALESCE(
  ppd.provider_metadata->>'paymentType',
  ppd.provider_metadata->>'paymentMethod',
  ppd.provider
)`;

function normalizeMethodFilter(raw) {
  const key = normalizeMethodKey(String(raw || '')) || '';
  if (!key) return null;
  if (key === 'credit_card' || key === 'debit_card' || key === 'payment') return 'card';
  if (key === 'applepay') return 'apple_pay';
  if (key === 'googlepay') return 'google_pay';
  if (key === 'scrypto' || key === 'selfcrypto') return 'crypto';
  if (key === 'ecashapp') return 'cashapp';
  if (METHOD_FILTER_ALIASES[key]) return key;
  return key.slice(0, 64);
}

function sqlStringList(values) {
  return values
    .map((v) => `'${String(v).replace(/'/g, "''")}'`)
    .join(', ');
}

function methodMatchSql(exprSql, methodKey) {
  const aliases = METHOD_FILTER_ALIASES[methodKey] || [methodKey];
  return `LOWER(TRIM(COALESCE(${exprSql}, ''))) IN (${sqlStringList(aliases)})`;
}

function buildMethodFilterClause(source, query) {
  const methodKey = normalizeMethodFilter(query.method);
  if (!methodKey) return null;

  if (source === 'dr') {
    const match = methodMatchSql('dr.method', methodKey);
    if (methodKey === 'card') {
      return `(${match} OR (
        LOWER(COALESCE(dr.provider, '')) = 'orionstarspay'
        AND LOWER(TRIM(COALESCE(dr.method, ''))) IN ('', 'payment', 'orionstarspay')
      ))`;
    }
    if (methodKey === 'crypto') {
      return `(${match} OR LOWER(COALESCE(dr.provider, '')) IN ('scrypto', 'selfcrypto', 'crypto'))`;
    }
    return match;
  }

  if (source === 'dpo') {
    const match = methodMatchSql(DEPOSIT_ORDER_METHOD_EXPR, methodKey);
    if (methodKey === 'card') {
      return `(${match} OR (
        LOWER(COALESCE(dpo.provider, '')) = 'orionstarspay'
        AND LOWER(TRIM(COALESCE(${DEPOSIT_ORDER_METHOD_EXPR}, ''))) IN ('', 'payment', 'orionstarspay')
      ))`;
    }
    if (methodKey === 'crypto') {
      return `(${match} OR LOWER(COALESCE(dpo.provider, '')) IN ('scrypto', 'selfcrypto', 'crypto'))`;
    }
    return match;
  }

  if (source === 'ppd') {
    return methodMatchSql(PENDING_DEPOSIT_METHOD_EXPR, methodKey);
  }

  if (source === 'cdr') {
    return methodKey === 'chime' ? null : '1 = 0';
  }

  return null;
}

function extractFeeCharged(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const fee =
    rawPayload?.rawPayload?.payload?.feeCharged
    ?? rawPayload?.payload?.feeCharged
    ?? rawPayload?.feeCharged
    ?? null;
  if (fee == null || fee === '') return null;
  const n = Number(fee);
  return Number.isFinite(n) ? n : null;
}

function extractReceivedAmount(eventRow) {
  if (!eventRow || typeof eventRow !== 'object') return null;
  const amount =
    eventRow.amount
    ?? eventRow?.rawPayload?.amount
    ?? eventRow?.rawPayload?.rawPayload?.payload?.amount
    ?? eventRow?.rawPayload?.payload?.amount
    ?? null;
  if (amount == null || amount === '') return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}

/**
 * Admin list row (matches legacy deposit_requests shape + user block).
 * @param {object} row — merged query row
 */
function serializeMergedRow(row, txMetaById = new Map(), role = null, feeMap = null) {
  const method = normalizeMethodKey(row.method) || '';
  const provider = row.provider || null;
  const isOrder = row._source === 'deposit_order';
  const isChime = row._source === 'chime_deposit';
  const isPending = row._source === 'pending_deposit';
  const id = isOrder
    ? `order:${String(row._order_id)}`
    : isChime
      ? `chime:${String(row._chime_id)}`
      : isPending
        ? `pending:${String(row._pending_id)}`
        : Number(row._legacy_id);
  const txId = (row.provider_transaction_id || '').toString().trim();
  const txMeta = txId ? (txMetaById.get(txId) || null) : null;

  const originalPayAmount =
    row.original_pay_amount != null && Number.isFinite(Number(row.original_pay_amount))
      ? Number(row.original_pay_amount)
      : null;
  const discountPercent =
    row.discount_percent != null && Number.isFinite(Number(row.discount_percent))
      ? Number(row.discount_percent)
      : null;
  const discountAmount =
    row.discount_amount != null && Number.isFinite(Number(row.discount_amount))
      ? Number(row.discount_amount)
      : null;
  const packageTitle =
    row.package_title != null && String(row.package_title).trim()
      ? String(row.package_title).trim()
      : null;
  const packageId =
    row.package_id != null && Number.isFinite(Number(row.package_id))
      ? Number(row.package_id)
      : null;
  const emailCampaignCode =
    row.email_campaign_code != null && String(row.email_campaign_code).trim()
      ? String(row.email_campaign_code).trim()
      : null;
  const emailCampaignDiscountType =
    row.email_campaign_discount_type != null && String(row.email_campaign_discount_type).trim()
      ? String(row.email_campaign_discount_type).trim().toLowerCase()
      : null;
  const emailCampaignDiscountValue =
    row.email_campaign_discount_value != null && Number.isFinite(Number(row.email_campaign_discount_value))
      ? Number(row.email_campaign_discount_value)
      : null;

  const item = {
    id,
    userId: row.userId,
    amount: Number(row.amount),
    receivedAmount: txMeta ? txMeta.receivedAmount : null,
    feeCharged: txMeta ? txMeta.feeCharged : null,
    providerFeeCharged: txMeta ? txMeta.feeCharged : null,
    currencyCode: 'SC',
    method,
    methodDisplayLabel: methodDisplayLabel(method, provider),
    status: row.status,
    provider,
    providerDisplayLabel: providerDisplayLabel(provider),
    providerTransactionId: row.provider_transaction_id || null,
    cryptoCurrency: row.crypto_currency || null,
    txHash: row.tx_hash || null,
    createdAt: row.created_at,
    originalPayAmount,
    discountPercent,
    discountAmount,
    packageTitle,
    packageId,
    emailCampaignCode,
    emailCampaignDiscountType,
    emailCampaignDiscountValue,
    discountSource: emailCampaignCode ? 'email_campaign' : discountAmount != null || discountPercent != null ? 'daily_bonus' : null
  };
  item.user = {
    userId: row.userId,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    storeCode: row.store_code,
    distributorCode: row.distributor_code
  };
  stripPlayerEmailFields(item.user, role);
  if (feeMap) {
    const fees = resolveFeesFromMap(item.user?.distributorCode, item.user?.storeCode, feeMap);
    item.feePercent = fees.payinPercent;
    item.feeCharged = computeCompletedFee(item.amount, fees.payinPercent, item.status);
  }
  return item;
}

/** Normalize UI/API provider filter to: orionstarspay | dollarpay | xxpay | chime | null */
function normalizeProviderFilter(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'orion' || key === 'orionstars' || key === 'orionstarspay' || key === 'orionstars_pay') {
    return 'orionstarspay';
  }
  if (key === 'dollarpay' || key === 'dollarpaywallet' || key === 'dollar_pay') {
    return 'dollarpay';
  }
  if (key === 'xxpay' || key === 'xx_pay') {
    return 'xxpay';
  }
  if (key === 'chime' || key === 'manual' || key === 'manual_chime' || key === 'manual-chime') {
    return 'chime';
  }
  return key.slice(0, 64);
}

function providerDisplayLabel(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (key === 'orionstarspay') return 'OrionStarPay';
  if (key === 'dollarpay' || key === 'xxpay') return getPaymentProviderDisplayLabel(key);
  if (key === 'chime') return 'Manual Chime';
  if (key === 'scrypto') return 'Crypto';
  if (key === 'selfcrypto') return 'Direct Crypto';
  return provider || '—';
}

function buildUserScopeSql(req, query, replacements) {
  const clauses = [];
  if (req.role === ROLES.STORE_ADMIN) {
    clauses.push('u.store_code = :scopedStoreCode');
    replacements.scopedStoreCode = req.storeCode || '';
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    clauses.push('u.distributor_code = :scopedDistributorCode');
    replacements.scopedDistributorCode = req.distributorCode || '';
    const scDist = query.storeCode && String(query.storeCode).trim();
    if (scDist) {
      clauses.push('u.store_code = :filterStoreCodeDist');
      replacements.filterStoreCodeDist = scDist;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    const sc = query.storeCode && String(query.storeCode).trim();
    const dc = query.distributorCode && String(query.distributorCode).trim();
    if (sc) {
      clauses.push('u.store_code = :filterStoreCode');
      replacements.filterStoreCode = sc;
    }
    if (dc) {
      clauses.push('u.distributor_code = :filterDistributorCode');
      replacements.filterDistributorCode = dc;
    }
  }
  return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
}

/**
 * V2 workflow credits via deposit_orders and also inserts a deposit_requests row for bonuses.
 * Hide the legacy row when a non-backfilled deposit_order shares the same provider transaction.
 */
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

/**
 * Approving a Chime manual request inserts deposit_requests (provider = manual-chime-deposit)
 * while chime_deposit_requests is also listed — hide the wallet credit twin.
 */
const DEPOSIT_REQUEST_CHIME_DEDUPE_SQL = `
  AND LOWER(COALESCE(dr.provider, '')) <> 'manual-chime-deposit'
`;

function buildDepositRequestFilters(query, replacements) {
  const parts = [];
  if (query.status && String(query.status).trim()) {
    const s = String(query.status).trim().toLowerCase();
    if (s === 'completed') {
      parts.push('LOWER(dr.status) IN (\'completed\', \'success\')');
    } else if (s === 'pending') {
      parts.push('LOWER(dr.status) = \'pending\'');
    } else if (s === 'failed') {
      parts.push('LOWER(dr.status) = \'failed\'');
    } else if (s === 'expired') {
      parts.push('LOWER(dr.status) = \'expired\'');
    } else if (s === 'closed') {
      parts.push('LOWER(dr.status) = \'closed\'');
    } else {
      parts.push('LOWER(dr.status) = LOWER(:drStatus)');
      replacements.drStatus = String(query.status).trim();
    }
  }
  const providerKey = normalizeProviderFilter(query.provider);
  if (providerKey) {
    parts.push('LOWER(COALESCE(dr.provider, \'\')) = :drProvider');
    replacements.drProvider = providerKey;
  }
  const methodClause = buildMethodFilterClause('dr', query);
  if (methodClause) parts.push(methodClause);
  const uid = parseInt(query.userId, 10);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('dr.user_id = :scopedUserId');
    replacements.scopedUserId = uid;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'dr.created_at', 'dr'));
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

function buildDepositOrderFilters(query, replacements) {
  // Alias must not be `do` — reserved in PostgreSQL (DO ... $$ blocks).
  const parts = ['(dpo.metadata IS NULL OR NOT (dpo.metadata ? \'legacyDepositRequestId\'))'];
  if (query.status && String(query.status).trim()) {
    const s = String(query.status).trim().toLowerCase();
    if (s === 'completed') {
      parts.push(`UPPER(COALESCE(dpo.status, '')) IN ('SUCCESS', 'COMPLETED')`);
    } else if (s === 'pending') {
      parts.push(`UPPER(COALESCE(dpo.status, '')) IN ('PENDING','LINK_CREATED')`);
    } else if (s === 'failed') {
      parts.push(`UPPER(COALESCE(dpo.status, '')) = 'FAILED'`);
    } else if (s === 'expired') {
      parts.push(`UPPER(COALESCE(dpo.status, '')) = 'EXPIRED'`);
    } else if (s === 'closed') {
      parts.push(`UPPER(COALESCE(dpo.status, '')) = 'CLOSED'`);
    } else {
      parts.push('LOWER(dpo.status) = LOWER(:orderStatusFilter)');
      replacements.orderStatusFilter = String(query.status).trim();
    }
  }
  const providerKey = normalizeProviderFilter(query.provider);
  if (providerKey) {
    parts.push('LOWER(COALESCE(dpo.provider, \'\')) = :doProvider');
    replacements.doProvider = providerKey;
  }
  const methodClause = buildMethodFilterClause('dpo', query);
  if (methodClause) parts.push(methodClause);
  const uid = parseInt(query.userId, 10);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('dpo.user_id = :scopedUserId');
    replacements.scopedUserId = uid;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'dpo.created_at', 'dpo'));
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

function buildChimeDepositFilters(query, replacements) {
  const parts = [];
  if (query.status && String(query.status).trim()) {
    const s = String(query.status).trim().toLowerCase();
    if (s === 'completed') {
      parts.push(`LOWER(COALESCE(cdr.status, '')) = 'completed'`);
    } else if (s === 'pending') {
      parts.push(`LOWER(COALESCE(cdr.status, '')) IN ('pending', 'processing')`);
    } else if (s === 'failed') {
      parts.push(`LOWER(COALESCE(cdr.status, '')) IN ('failed', 'rejected')`);
    } else if (s === 'expired') {
      parts.push(`LOWER(COALESCE(cdr.status, '')) = 'expired'`);
    } else {
      parts.push('LOWER(COALESCE(cdr.status, \'\')) = LOWER(:cdrStatus)');
      replacements.cdrStatus = String(query.status).trim();
    }
  }
  const methodClause = buildMethodFilterClause('cdr', query);
  if (methodClause) parts.push(methodClause);
  const uid = parseInt(query.userId, 10);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('cdr.user_id = :scopedUserId');
    replacements.scopedUserId = uid;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'cdr.created_at', 'cdr'));
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

/**
 * Pending DollarPay / XXPay / Direct Crypto sessions that may not yet have a deposit_orders row.
 */
function buildPendingDepositFilters(query, replacements) {
  const parts = [
    `LOWER(COALESCE(ppd.status, '')) IN ('pending', 'confirming')`,
    `LOWER(COALESCE(ppd.provider, '')) IN ('dollarpay', 'xxpay', 'selfcrypto')`,
    `NOT EXISTS (
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
    )`
  ];
  if (query.status && String(query.status).trim()) {
    const s = String(query.status).trim().toLowerCase();
    // Only pending rows live here; other status filters exclude them.
    if (s !== 'pending') {
      parts.push('1 = 0');
    }
  }
  const providerKey = normalizeProviderFilter(query.provider);
  if (providerKey) {
    if (providerKey === 'dollarpay' || providerKey === 'xxpay' || providerKey === 'selfcrypto') {
      parts.push('LOWER(COALESCE(ppd.provider, \'\')) = :ppdProvider');
      replacements.ppdProvider = providerKey;
    } else {
      parts.push('1 = 0');
    }
  }
  const methodClause = buildMethodFilterClause('ppd', query);
  if (methodClause) parts.push(methodClause);
  const uid = parseInt(query.userId, 10);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('ppd.user_id = :scopedUserId');
    replacements.scopedUserId = uid;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'ppd.created_at', 'ppd'));
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

function buildDepositSummaryDateAndScopeFilters(req, query, replacements) {
  const parts = [];
  if (req.role === ROLES.STORE_ADMIN) {
    parts.push('u.store_code = :sumStoreCode');
    replacements.sumStoreCode = req.storeCode || '';
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    parts.push('u.distributor_code = :sumDistributorCode');
    replacements.sumDistributorCode = req.distributorCode || '';
    const scDist = query.storeCode && String(query.storeCode).trim();
    if (scDist) {
      parts.push('u.store_code = :sumFilterStoreCodeDist');
      replacements.sumFilterStoreCodeDist = scDist;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    const sc = query.storeCode && String(query.storeCode).trim();
    const dc = query.distributorCode && String(query.distributorCode).trim();
    if (sc) {
      parts.push('u.store_code = :sumFilterStoreCode');
      replacements.sumFilterStoreCode = sc;
    }
    if (dc) {
      parts.push('u.distributor_code = :sumFilterDistributorCode');
      replacements.sumFilterDistributorCode = dc;
    }
  }
  const uid = parseInt(query.userId, 10);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('u.user_id = :sumScopedUserId');
    replacements.sumScopedUserId = uid;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'src.created_at', 'sum'));
  return parts.length ? `WHERE ${parts.join(' AND ')}` : '';
}

/**
 * Paginated deposits for admin: legacy `deposit_requests` plus V2 `deposit_orders`
 * (excluding rows backfilled from deposit_requests to avoid duplicates).
 */
async function listDepositRequestsAdmin(req, query = {}) {
  if (req.role === ROLES.STORE_ADMIN) {
    if (!req.storeCode) {
      return { success: true, list: [], total: 0, page: 1, limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)) };
    }
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    if (!req.distributorCode) {
      return { success: true, list: [], total: 0, page: 1, limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)) };
    }
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const replacements = { limit, offset };
  const userScopeSql = buildUserScopeSql(req, query, replacements);
  const providerKey = normalizeProviderFilter(query.provider);
  const methodKey = normalizeMethodFilter(query.method);
  const includeLegacyAndOrders = providerKey !== 'chime';
  const includeChime = (!providerKey || providerKey === 'chime') && (!methodKey || methodKey === 'chime');
  const includePendingWallet =
    includeLegacyAndOrders &&
    (!providerKey || providerKey === 'dollarpay' || providerKey === 'xxpay' || providerKey === 'selfcrypto');
  const drFilterSql = includeLegacyAndOrders ? buildDepositRequestFilters(query, replacements) : '';
  const orderFilterSql = includeLegacyAndOrders ? buildDepositOrderFilters(query, replacements) : '';
  const chimeFilterSql = includeChime ? buildChimeDepositFilters(query, replacements) : '';
  const pendingFilterSql = includePendingWallet ? buildPendingDepositFilters(query, replacements) : '';

  const unionParts = [];
  const amountParts = [];
  if (includeLegacyAndOrders) {
    unionParts.push(`
      SELECT 1
      FROM deposit_requests dr
      INNER JOIN users u ON u.user_id = dr.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${drFilterSql}
      ${DEPOSIT_REQUEST_V2_DEDUPE_SQL}
      ${DEPOSIT_REQUEST_CHIME_DEDUPE_SQL}
    `);
    amountParts.push(`
      SELECT
        dr.amount::numeric AS amount,
        CASE
          WHEN LOWER(COALESCE(dr.status, '')) IN ('completed', 'success') THEN 'completed'
          WHEN LOWER(COALESCE(dr.status, '')) IN ('pending', 'processing', 'confirming') THEN 'pending'
          WHEN LOWER(COALESCE(dr.status, '')) = 'expired' THEN 'expired'
          WHEN LOWER(COALESCE(dr.status, '')) IN ('failed', 'rejected') THEN 'failed'
          ELSE LOWER(COALESCE(dr.status, ''))
        END AS status_key
      FROM deposit_requests dr
      INNER JOIN users u ON u.user_id = dr.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${drFilterSql}
      ${DEPOSIT_REQUEST_V2_DEDUPE_SQL}
      ${DEPOSIT_REQUEST_CHIME_DEDUPE_SQL}
    `);
    unionParts.push(`
      SELECT 1
      FROM deposit_orders dpo
      INNER JOIN users u ON u.user_id = dpo.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${orderFilterSql}
    `);
    amountParts.push(`
      SELECT
        dpo.requested_amount::numeric AS amount,
        CASE
          WHEN UPPER(COALESCE(dpo.status, '')) IN ('SUCCESS', 'COMPLETED') THEN 'completed'
          WHEN UPPER(COALESCE(dpo.status, '')) IN ('PENDING', 'LINK_CREATED') THEN 'pending'
          WHEN UPPER(COALESCE(dpo.status, '')) = 'EXPIRED' THEN 'expired'
          WHEN UPPER(COALESCE(dpo.status, '')) = 'FAILED' THEN 'failed'
          WHEN UPPER(COALESCE(dpo.status, '')) = 'CLOSED' THEN 'closed'
          ELSE LOWER(COALESCE(dpo.status, 'pending'))
        END AS status_key
      FROM deposit_orders dpo
      INNER JOIN users u ON u.user_id = dpo.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${orderFilterSql}
    `);
  }
  if (includePendingWallet) {
    unionParts.push(`
      SELECT 1
      FROM payment_pending_deposits ppd
      INNER JOIN users u ON u.user_id = ppd.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${pendingFilterSql}
    `);
    amountParts.push(`
      SELECT
        ppd.amount::numeric AS amount,
        CASE
          WHEN LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success') THEN 'completed'
          WHEN LOWER(COALESCE(ppd.status, '')) IN ('pending', 'confirming', 'processing') THEN 'pending'
          WHEN LOWER(COALESCE(ppd.status, '')) = 'expired' THEN 'expired'
          WHEN LOWER(COALESCE(ppd.status, '')) IN ('failed', 'rejected') THEN 'failed'
          ELSE LOWER(COALESCE(ppd.status, 'pending'))
        END AS status_key
      FROM payment_pending_deposits ppd
      INNER JOIN users u ON u.user_id = ppd.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${pendingFilterSql}
    `);
  }
  if (includeChime) {
    unionParts.push(`
      SELECT 1
      FROM chime_deposit_requests cdr
      INNER JOIN users u ON u.user_id = cdr.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${chimeFilterSql}
    `);
    amountParts.push(`
      SELECT
        cdr.amount::numeric AS amount,
        CASE
          WHEN LOWER(COALESCE(cdr.status, '')) IN ('completed', 'success') THEN 'completed'
          WHEN LOWER(COALESCE(cdr.status, '')) IN ('pending', 'processing') THEN 'pending'
          WHEN LOWER(COALESCE(cdr.status, '')) = 'expired' THEN 'expired'
          WHEN LOWER(COALESCE(cdr.status, '')) IN ('failed', 'rejected') THEN 'failed'
          ELSE LOWER(COALESCE(cdr.status, ''))
        END AS status_key
      FROM chime_deposit_requests cdr
      INNER JOIN users u ON u.user_id = cdr.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${chimeFilterSql}
    `);
  }

  const countSql = `
    SELECT COUNT(*)::int AS total FROM (
      ${unionParts.join(' UNION ALL ')}
    ) AS c
  `;

  const totalsSql = `
    SELECT
      COALESCE(SUM(CASE WHEN a.status_key = 'completed' THEN a.amount ELSE 0 END), 0)::float AS "completedAmount",
      COALESCE(SUM(CASE WHEN a.status_key = 'pending' THEN a.amount ELSE 0 END), 0)::float AS "pendingAmount",
      COALESCE(SUM(CASE WHEN a.status_key = 'expired' THEN a.amount ELSE 0 END), 0)::float AS "expiredAmount",
      COALESCE(SUM(CASE WHEN a.status_key = 'failed' THEN a.amount ELSE 0 END), 0)::float AS "failedAmount",
      COALESCE(SUM(a.amount), 0)::float AS "allAmount"
    FROM (
      ${amountParts.join(' UNION ALL ')}
    ) AS a
  `;
  const listParts = [];
  if (includeLegacyAndOrders) {
    listParts.push(`
      SELECT
        'deposit_request'::text AS "_source",
        dr.id AS "_legacy_id",
        NULL::bigint AS "_order_id",
        NULL::bigint AS "_chime_id",
        NULL::bigint AS "_pending_id",
        dr.user_id AS "userId",
        dr.amount::numeric AS "amount",
        dr.method AS "method",
        dr.status AS "status",
        dr.provider AS "provider",
        dr.provider_transaction_id AS "provider_transaction_id",
        dr.crypto_currency AS "crypto_currency",
        dr.tx_hash AS "tx_hash",
        dr.created_at AS "created_at",
        u.username AS "username",
        u.email AS "email",
        u.first_name AS "first_name",
        u.last_name AS "last_name",
        u.store_code AS "store_code",
        u.distributor_code AS "distributor_code",
        NULL::numeric AS "original_pay_amount",
        NULL::numeric AS "discount_percent",
        NULL::numeric AS "discount_amount",
        NULL::text AS "package_title",
        NULL::integer AS "package_id",
        NULL::text AS "email_campaign_code",
        NULL::text AS "email_campaign_discount_type",
        NULL::numeric AS "email_campaign_discount_value"
      FROM deposit_requests dr
      INNER JOIN users u ON u.user_id = dr.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${drFilterSql}
      ${DEPOSIT_REQUEST_V2_DEDUPE_SQL}
      ${DEPOSIT_REQUEST_CHIME_DEDUPE_SQL}
    `);
    listParts.push(`
      SELECT
        'deposit_order'::text,
        NULL,
        dpo.id,
        NULL,
        NULL,
        dpo.user_id,
        dpo.requested_amount::numeric,
        COALESCE(
          dpo.metadata->>'selectedDepositMethod',
          dpo.metadata->>'paymentType',
          dpo.metadata->>'paymentMethod',
          CASE
            WHEN jsonb_typeof(dpo.metadata->'acceptedPaymentOptions') = 'array' THEN dpo.metadata->'acceptedPaymentOptions'->>0
            ELSE dpo.metadata->>'acceptedPaymentOptions'
          END
        ) AS "method",
        CASE
          WHEN UPPER(COALESCE(dpo.status, '')) IN ('SUCCESS', 'COMPLETED') THEN 'completed'
          WHEN UPPER(COALESCE(dpo.status, '')) = 'FAILED' THEN 'failed'
          WHEN UPPER(COALESCE(dpo.status, '')) = 'EXPIRED' THEN 'expired'
          WHEN UPPER(COALESCE(dpo.status, '')) = 'CLOSED' THEN 'closed'
          ELSE 'pending'
        END,
        dpo.provider,
        COALESCE(dpo.provider_transaction_id, dpo.payment_link_token),
        NULL::varchar,
        NULL::varchar,
        dpo.created_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.store_code,
        u.distributor_code,
        COALESCE(
          NULLIF(dpo.metadata->>'originalPayAmount', '')::numeric,
          NULLIF(dpo.metadata->>'emailCampaignOriginalPayAmount', '')::numeric
        ),
        COALESCE(
          NULLIF(dpo.metadata->>'dailyBonusPercentOff', '')::numeric,
          CASE
            WHEN lower(COALESCE(dpo.metadata->>'emailCampaignDiscountType', '')) IN ('percentage', 'percent')
              THEN NULLIF(dpo.metadata->>'emailCampaignDiscountValue', '')::numeric
            ELSE NULL
          END
        ),
        COALESCE(
          NULLIF(dpo.metadata->>'dailyBonusDiscountAmount', '')::numeric,
          NULLIF(dpo.metadata->>'emailCampaignDiscountAmount', '')::numeric
        ),
        NULLIF(dpo.metadata->>'packageTitle', ''),
        NULLIF(dpo.metadata->>'packageId', '')::integer,
        NULLIF(dpo.metadata->>'emailCampaignCode', ''),
        NULLIF(dpo.metadata->>'emailCampaignDiscountType', ''),
        NULLIF(dpo.metadata->>'emailCampaignDiscountValue', '')::numeric
      FROM deposit_orders dpo
      INNER JOIN users u ON u.user_id = dpo.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${orderFilterSql}
    `);
  }
  if (includePendingWallet) {
    listParts.push(`
      SELECT
        'pending_deposit'::text,
        NULL,
        NULL,
        NULL,
        ppd.id,
        ppd.user_id,
        ppd.amount::numeric,
        COALESCE(
          ppd.provider_metadata->>'paymentType',
          ppd.provider_metadata->>'paymentMethod',
          ppd.provider
        ) AS "method",
        'pending'::varchar AS "status",
        ppd.provider,
        COALESCE(
          ppd.provider_metadata->>'payOrderNo',
          ppd.provider_session_id
        ) AS "provider_transaction_id",
        ppd.target_currency,
        NULL::varchar,
        ppd.created_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.store_code,
        u.distributor_code,
        COALESCE(
          NULLIF(ppd.provider_metadata->>'originalPayAmount', '')::numeric,
          NULLIF(ppd.provider_metadata->>'emailCampaignOriginalPayAmount', '')::numeric
        ),
        COALESCE(
          NULLIF(ppd.provider_metadata->>'dailyBonusPercentOff', '')::numeric,
          CASE
            WHEN lower(COALESCE(ppd.provider_metadata->>'emailCampaignDiscountType', '')) IN ('percentage', 'percent')
              THEN NULLIF(ppd.provider_metadata->>'emailCampaignDiscountValue', '')::numeric
            ELSE NULL
          END
        ),
        COALESCE(
          NULLIF(ppd.provider_metadata->>'dailyBonusDiscountAmount', '')::numeric,
          NULLIF(ppd.provider_metadata->>'emailCampaignDiscountAmount', '')::numeric
        ),
        NULLIF(ppd.provider_metadata->>'packageTitle', ''),
        NULLIF(ppd.provider_metadata->>'packageId', '')::integer,
        NULLIF(ppd.provider_metadata->>'emailCampaignCode', ''),
        NULLIF(ppd.provider_metadata->>'emailCampaignDiscountType', ''),
        NULLIF(ppd.provider_metadata->>'emailCampaignDiscountValue', '')::numeric
      FROM payment_pending_deposits ppd
      INNER JOIN users u ON u.user_id = ppd.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${pendingFilterSql}
    `);
  }
  if (includeChime) {
    listParts.push(`
      SELECT
        'chime_deposit'::text,
        NULL,
        NULL,
        cdr.id,
        NULL,
        cdr.user_id,
        cdr.amount::numeric,
        'chime'::varchar AS "method",
        LOWER(COALESCE(cdr.status, '')) AS "status",
        'chime'::varchar AS "provider",
        COALESCE(cdr.source_username, cdr.destination_username)::varchar AS "provider_transaction_id",
        NULL::varchar,
        NULL::varchar,
        cdr.created_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.store_code,
        u.distributor_code,
        COALESCE(
          NULLIF(cdr.metadata->>'originalPayAmount', '')::numeric,
          NULLIF(cdr.metadata->>'emailCampaignOriginalPayAmount', '')::numeric
        ),
        COALESCE(
          NULLIF(cdr.metadata->>'dailyBonusPercentOff', '')::numeric,
          CASE
            WHEN lower(COALESCE(cdr.metadata->>'emailCampaignDiscountType', '')) IN ('percentage', 'percent')
              THEN NULLIF(cdr.metadata->>'emailCampaignDiscountValue', '')::numeric
            ELSE NULL
          END
        ),
        COALESCE(
          NULLIF(cdr.metadata->>'dailyBonusDiscountAmount', '')::numeric,
          NULLIF(cdr.metadata->>'emailCampaignDiscountAmount', '')::numeric
        ),
        NULLIF(cdr.metadata->>'packageTitle', ''),
        COALESCE(
          NULLIF(cdr.metadata->>'packageId', '')::integer,
          cdr.package_id
        ),
        NULLIF(cdr.metadata->>'emailCampaignCode', ''),
        NULLIF(cdr.metadata->>'emailCampaignDiscountType', ''),
        NULLIF(cdr.metadata->>'emailCampaignDiscountValue', '')::numeric
      FROM chime_deposit_requests cdr
      INNER JOIN users u ON u.user_id = cdr.user_id
      WHERE 1 = 1
      ${userScopeSql}
      ${chimeFilterSql}
    `);
  }

  const listSql = `
    SELECT * FROM (
      ${listParts.join(' UNION ALL ')}
    ) AS merged
    ORDER BY merged.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  const [countRows] = await db.sequelize.query(countSql, {
    replacements,
    type: QueryTypes.SELECT
  });

  const total = countRows && typeof countRows.total === 'number' ? countRows.total : 0;

  const [totalsRows, rows] = await Promise.all([
    db.sequelize.query(totalsSql, {
      replacements,
      type: QueryTypes.SELECT
    }),
    db.sequelize.query(listSql, {
      replacements,
      type: QueryTypes.SELECT
    })
  ]);
  const totalsRow = totalsRows?.[0] || {};
  const totals = {
    count: total,
    completedAmount: Number(totalsRow.completedAmount) || 0,
    pendingAmount: Number(totalsRow.pendingAmount) || 0,
    expiredAmount: Number(totalsRow.expiredAmount) || 0,
    failedAmount: Number(totalsRow.failedAmount) || 0,
    allAmount: Number(totalsRow.allAmount) || 0
  };
  const sumReplacements = {};
  const summaryScopeSql = buildDepositSummaryDateAndScopeFilters(req, query, sumReplacements);
  const payinFeeJoinSql = buildStoreFeeJoinSql({
    storeExpr: 'u.store_code',
    distExpr: 'u.distributor_code',
    kind: 'payin',
    prefix: 'payin'
  });
  const payinCompletedFee = (providerKeySql) => completedFeeSql(
    'src.amount',
    `${providerKeySql} AND src.status_key IN ('completed', 'success')`,
    'payin'
  );
  const chimeCompletedFee = completedFeeSql(
    'cdr.amount',
    `LOWER(COALESCE(cdr.status, '')) IN ('completed', 'success')`,
    'payin'
  );
  const summarySql = `
    WITH src AS (
      SELECT
        dr.user_id AS user_id,
        dr.created_at AS created_at,
        LOWER(COALESCE(dr.status, '')) AS status_key,
        LOWER(COALESCE(dr.provider, '')) AS provider_key,
        dr.amount::numeric AS amount
      FROM deposit_requests dr
      WHERE NOT EXISTS (
        SELECT 1
        FROM deposit_orders dpo_v2
        WHERE dpo_v2.user_id = dr.user_id
          AND dpo_v2.provider_transaction_id IS NOT NULL
          AND dr.provider_transaction_id IS NOT NULL
          AND TRIM(dpo_v2.provider_transaction_id) = TRIM(dr.provider_transaction_id)
          AND (dpo_v2.metadata IS NULL OR NOT (dpo_v2.metadata ? 'legacyDepositRequestId'))
      )
      AND LOWER(COALESCE(dr.provider, '')) <> 'manual-chime-deposit'
      UNION ALL
      SELECT
        dpo.user_id AS user_id,
        dpo.created_at AS created_at,
        CASE
          WHEN UPPER(COALESCE(dpo.status, '')) IN ('SUCCESS', 'COMPLETED') THEN 'completed'
          WHEN UPPER(COALESCE(dpo.status, '')) IN ('PENDING', 'LINK_CREATED') THEN 'pending'
          ELSE LOWER(COALESCE(dpo.status, ''))
        END AS status_key,
        LOWER(COALESCE(dpo.provider, '')) AS provider_key,
        dpo.requested_amount::numeric AS amount
      FROM deposit_orders dpo
      WHERE (dpo.metadata IS NULL OR NOT (dpo.metadata ? 'legacyDepositRequestId'))
      UNION ALL
      -- Pending DollarPay / XXPay / Direct Crypto sessions may exist only on payment_pending_deposits
      SELECT
        ppd.user_id AS user_id,
        ppd.created_at AS created_at,
        'pending' AS status_key,
        LOWER(COALESCE(ppd.provider, '')) AS provider_key,
        ppd.amount::numeric AS amount
      FROM payment_pending_deposits ppd
      WHERE LOWER(COALESCE(ppd.status, '')) IN ('pending', 'confirming')
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
    )
    SELECT
      COALESCE(SUM(CASE WHEN src.provider_key = 'orionstarspay' AND src.status_key IN ('completed', 'success') THEN src.amount ELSE 0 END), 0)::float AS "orionCompletedAmount",
      COALESCE(SUM(CASE WHEN src.provider_key = 'orionstarspay' AND src.status_key = 'pending' THEN src.amount ELSE 0 END), 0)::float AS "orionPendingAmount",
      COALESCE(COUNT(CASE WHEN src.provider_key = 'orionstarspay' AND src.status_key IN ('completed', 'success') THEN 1 END), 0)::int AS "orionCompletedCount",
      COALESCE(COUNT(CASE WHEN src.provider_key = 'orionstarspay' AND src.status_key = 'pending' THEN 1 END), 0)::int AS "orionPendingCount",
      COALESCE(SUM(CASE WHEN src.provider_key = 'dollarpay' AND src.status_key IN ('completed', 'success') THEN src.amount ELSE 0 END), 0)::float AS "dollarpayCompletedAmount",
      COALESCE(SUM(CASE WHEN src.provider_key = 'dollarpay' AND src.status_key = 'pending' THEN src.amount ELSE 0 END), 0)::float AS "dollarpayPendingAmount",
      COALESCE(COUNT(CASE WHEN src.provider_key = 'dollarpay' AND src.status_key IN ('completed', 'success') THEN 1 END), 0)::int AS "dollarpayCompletedCount",
      COALESCE(COUNT(CASE WHEN src.provider_key = 'dollarpay' AND src.status_key = 'pending' THEN 1 END), 0)::int AS "dollarpayPendingCount",
      COALESCE(SUM(CASE WHEN src.provider_key = 'xxpay' AND src.status_key IN ('completed', 'success') THEN src.amount ELSE 0 END), 0)::float AS "xxpayCompletedAmount",
      COALESCE(SUM(CASE WHEN src.provider_key = 'xxpay' AND src.status_key = 'pending' THEN src.amount ELSE 0 END), 0)::float AS "xxpayPendingAmount",
      COALESCE(COUNT(CASE WHEN src.provider_key = 'xxpay' AND src.status_key IN ('completed', 'success') THEN 1 END), 0)::int AS "xxpayCompletedCount",
      COALESCE(COUNT(CASE WHEN src.provider_key = 'xxpay' AND src.status_key = 'pending' THEN 1 END), 0)::int AS "xxpayPendingCount",
      COALESCE(SUM(${payinCompletedFee(`src.provider_key = 'orionstarspay'`)}), 0)::float AS "orionCompletedFee",
      COALESCE(SUM(${payinCompletedFee(`src.provider_key = 'dollarpay'`)}), 0)::float AS "dollarpayCompletedFee",
      COALESCE(SUM(${payinCompletedFee(`src.provider_key = 'xxpay'`)}), 0)::float AS "xxpayCompletedFee"
    FROM src
    INNER JOIN users u ON u.user_id = src.user_id
    ${payinFeeJoinSql}
    ${summaryScopeSql}
  `;
  const chimeSummarySql = `
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(cdr.status, '')) = 'completed' THEN cdr.amount ELSE 0 END), 0)::float AS "chimeCompletedAmount",
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(cdr.status, '')) IN ('pending', 'processing') THEN cdr.amount ELSE 0 END), 0)::float AS "chimePendingAmount",
      COALESCE(COUNT(CASE WHEN LOWER(COALESCE(cdr.status, '')) = 'completed' THEN 1 END), 0)::int AS "chimeCompletedCount",
      COALESCE(COUNT(CASE WHEN LOWER(COALESCE(cdr.status, '')) IN ('pending', 'processing') THEN 1 END), 0)::int AS "chimePendingCount",
      COALESCE(SUM(${chimeCompletedFee}), 0)::float AS "chimeCompletedFee"
    FROM chime_deposit_requests cdr
    INNER JOIN users u ON u.user_id = cdr.user_id
    ${payinFeeJoinSql}
    ${summaryScopeSql.replace(/src\.created_at/g, 'cdr.created_at')}
  `;
  const [summaryRows, chimeSummaryRows, feeMap] = await Promise.all([
    db.sequelize.query(summarySql, { replacements: sumReplacements, type: QueryTypes.SELECT }),
    db.sequelize.query(chimeSummarySql, { replacements: sumReplacements, type: QueryTypes.SELECT }),
    loadTransactionFeeMap().catch(() => null)
  ]);
  const sum = summaryRows?.[0] || {};
  const chimeSum = chimeSummaryRows?.[0] || {};
  const summary = {
    orionstarspay: {
      completedAmount: Number(sum.orionCompletedAmount) || 0,
      pendingAmount: Number(sum.orionPendingAmount) || 0,
      completedCount: Number(sum.orionCompletedCount) || 0,
      pendingCount: Number(sum.orionPendingCount) || 0,
      completedFee: Number(sum.orionCompletedFee) || 0
    },
    dollarpay: {
      completedAmount: Number(sum.dollarpayCompletedAmount) || 0,
      pendingAmount: Number(sum.dollarpayPendingAmount) || 0,
      completedCount: Number(sum.dollarpayCompletedCount) || 0,
      pendingCount: Number(sum.dollarpayPendingCount) || 0,
      completedFee: Number(sum.dollarpayCompletedFee) || 0
    },
    xxpay: {
      completedAmount: Number(sum.xxpayCompletedAmount) || 0,
      pendingAmount: Number(sum.xxpayPendingAmount) || 0,
      completedCount: Number(sum.xxpayCompletedCount) || 0,
      pendingCount: Number(sum.xxpayPendingCount) || 0,
      completedFee: Number(sum.xxpayCompletedFee) || 0
    },
    chime: {
      completedAmount: Number(chimeSum.chimeCompletedAmount) || 0,
      pendingAmount: Number(chimeSum.chimePendingAmount) || 0,
      completedCount: Number(chimeSum.chimeCompletedCount) || 0,
      pendingCount: Number(chimeSum.chimePendingCount) || 0,
      completedFee: Number(chimeSum.chimeCompletedFee) || 0
    }
  };

  const txIds = [...new Set((rows || [])
    .map((r) => (r.provider_transaction_id || '').toString().trim())
    .filter(Boolean))];

  let txMetaById = new Map();
  if (txIds.length > 0 && db.ProviderTransactionEvent) {
    try {
      const txRows = await db.ProviderTransactionEvent.findAll({
        where: { providerTransactionId: txIds },
        attributes: ['providerTransactionId', 'amount', 'rawPayload'],
        raw: true
      });
      txMetaById = new Map((txRows || []).map((t) => {
        const key = String(t.providerTransactionId);
        return [key, {
          receivedAmount: extractReceivedAmount(t),
          feeCharged: extractFeeCharged(t.rawPayload)
        }];
      }));
    } catch {
      txMetaById = new Map();
    }
  }

  return {
    success: true,
    list: (rows || []).map((r) => serializeMergedRow(r, txMetaById, req.role, feeMap)),
    total,
    page,
    limit,
    summary,
    totals
  };
}

/**
 * Distinct primary store codes (store_admin owner rows) for platform payment-totals filters.
 * @returns {Promise<string[]>}
 */
async function listPaymentTotalsStoreCodesAdmin() {
  const rows = await db.User.findAll({
    attributes: ['storeCode'],
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      isActive: true,
      storeCode: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
    },
    raw: true
  });
  const codes = [...new Set((rows || [])
    .map((r) => String(r.storeCode || '').trim())
    .filter(Boolean))];
  codes.sort((a, b) => a.localeCompare(b));
  return codes;
}

module.exports = { listDepositRequestsAdmin, listPaymentTotalsStoreCodesAdmin };
