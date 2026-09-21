'use strict';

const db = require('../../db/models');
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { getPaymentTypeLabel } = require('../../constants/paymentTypes');
const { buildDateTimeRangeFilterParts } = require('../../utils/dateRangeFilters');
const { buildApproverPayload } = require('../../utils/approverUserPayload');
const { stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');
const { buildStoreFeeJoinSql, completedFeeSql } = require('./transactionFees.service');

function normalizeMethodKey(raw) {
  if (typeof raw !== 'string') return '';
  const key = raw.trim().toLowerCase();
  if (!key) return '';
  if (key === 'apple pay') return 'apple_pay';
  if (key === 'google pay') return 'google_pay';
  return key;
}

function buildUserJoinScope(req, query, replacements) {
  let sql = ` AND u.role = :roleUser `;
  replacements.roleUser = ROLES.USER;

  if (req.role === ROLES.STORE_ADMIN) {
    sql += ` AND u.store_code = :scopedStore AND u.distributor_code = :scopedDist `;
    replacements.scopedStore = req.storeCode || '';
    replacements.scopedDist = req.distributorCode || '';
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    sql += ` AND u.distributor_code = :scopedDistJoin `;
    replacements.scopedDistJoin = req.distributorCode || '';
    const sc = query.storeCode != null ? String(query.storeCode).trim() : '';
    if (sc) {
      sql += ` AND u.store_code = :filterStoreJoin `;
      replacements.filterStoreJoin = sc;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    const dc = query.distributorCode != null ? String(query.distributorCode).trim() : '';
    const sc = query.storeCode != null ? String(query.storeCode).trim() : '';
    if (dc) {
      sql += ` AND u.distributor_code = :filterDistJoin `;
      replacements.filterDistJoin = dc;
    }
    if (sc) {
      sql += ` AND u.store_code = :filterStoreJoin `;
      replacements.filterStoreJoin = sc;
    }
  }
  return sql;
}

function buildChimeWhere(req, query, replacements) {
  let sql = ' ';
  if (req.role === ROLES.STORE_ADMIN) {
    sql += ` AND cc.store_code = :ccScopedStore AND cc.distributor_code = :ccScopedDist `;
    replacements.ccScopedStore = req.storeCode || '';
    replacements.ccScopedDist = req.distributorCode || '';
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    sql += ` AND cc.distributor_code = :ccScopedDistOnly `;
    replacements.ccScopedDistOnly = req.distributorCode || '';
    const sc = query.storeCode != null ? String(query.storeCode).trim() : '';
    if (sc) {
      sql += ` AND cc.store_code = :ccFilterStore `;
      replacements.ccFilterStore = sc;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    const dc = query.distributorCode != null ? String(query.distributorCode).trim() : '';
    const sc = query.storeCode != null ? String(query.storeCode).trim() : '';
    if (dc) {
      sql += ` AND cc.distributor_code = :ccFilterDist `;
      replacements.ccFilterDist = dc;
    }
    if (sc) {
      sql += ` AND cc.store_code = :ccFilterStore `;
      replacements.ccFilterStore = sc;
    }
  }
  return sql;
}

function buildDateFilterSql(query, replacements, columnRef, keyPrefix) {
  const parts = buildDateTimeRangeFilterParts(query, replacements, columnRef, keyPrefix);
  if (!parts.length) return '';
  return ` AND ${parts.join(' AND ')} `;
}

function buildUserIdFilterSql(query, replacements, columnRef) {
  const uid = parseInt(query.userId, 10);
  if (!Number.isFinite(uid) || uid <= 0) return '';
  replacements.scopedUserId = uid;
  return ` AND ${columnRef} = :scopedUserId `;
}

function serializeMergedRow(row, role = null) {
  const pick = (a, b) => (a !== undefined && a !== null ? a : b);
  const sourceKind = pick(row.source_kind, row.sourceKind);
  const methodRaw = row.method_or_payout != null ? String(row.method_or_payout).trim()
    : row.methodOrPayout != null ? String(row.methodOrPayout).trim() : '';
  const routingOrProv = row.routing_or_provider != null ? String(row.routing_or_provider).trim()
    : row.routingOrProvider != null ? String(row.routingOrProvider).trim() : '';

  let paymentMethodLabel = '—';
  let providerCode = '—';

  if (sourceKind === 'manual_chime') {
    const pt = methodRaw.toLowerCase();
    paymentMethodLabel = pt === 'chime' ? 'Chime (manual)' : pt === 'cashapp' ? 'Cash App (manual)' : methodRaw || 'Manual payout';
    providerCode = `manual_${pt || 'chime_cashapp'}`;
  } else if (sourceKind === 'speed') {
    paymentMethodLabel = 'Crypto (Speed / LNURL)';
    providerCode = routingOrProv || methodRaw || 'scrypto';
  } else {
    const label = getPaymentTypeLabel(normalizeMethodKey(methodRaw));
    paymentMethodLabel = label || methodRaw || '—';
    providerCode = routingOrProv || methodRaw || '—';
  }

  const userId = pick(row.user_id, row.userId);
  const createdAt = pick(row.created_at, row.createdAt);
  const approvedByUserId = pick(row.approved_by_user_id, row.approvedByUserId);
  const approvedAt = pick(row.approved_at, row.approvedAt) || null;
  const approvedBy = approvedByUserId
    ? buildApproverPayload({
        userId: Number(approvedByUserId),
        username: row.approver_username || null,
        email: row.approver_email || null,
        firstName: row.approver_first_name || null,
        lastName: row.approver_last_name || null,
        role: row.approver_role || null,
        AdminRole: row.approver_admin_role_name ? { name: row.approver_admin_role_name } : null,
        StoreRole: row.approver_store_role_name ? { name: row.approver_store_role_name } : null
      })
    : null;

  return {
    uid: row.uid,
    sourceKind,
    id: pick(row.source_id, row.sourceId),
    userId,
    amount: Number(row.amount),
    currency: row.currency || 'USD',
    status: row.status || '—',
    paymentMethodLabel,
    providerCode,
    methodRaw: methodRaw || null,
    routingOrProviderRaw: routingOrProv || null,
    approvedByUserId: approvedByUserId != null ? Number(approvedByUserId) : null,
    approvedBy,
    approvedAt,
    createdAt,
    user: row.username || row.email || row.first_name || row.last_name
      ? stripPlayerEmailFields({
          userId,
          username: row.username || null,
          email: row.email || null,
          firstName: row.first_name || row.firstName || null,
          lastName: row.last_name || row.lastName || null
        }, role)
      : null
  };
}

/**
 * Unified withdrawal list for admin: withdrawal_requests + speed_withdraw_requests + chime_cashapp_withdrawal_requests.
 * Scoped like deposit-requests (store / distributor / master + optional query filters).
 */
async function listWithdrawalRequestsAdmin(req, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const replacements = {
    limit,
    offset
  };

  const userScope = buildUserJoinScope(req, query, replacements);
  const chimeScope = buildChimeWhere(req, query, replacements);
  const wrDateScope = buildDateFilterSql(query, replacements, 'wr.created_at', 'wr');
  const speedDateScope = buildDateFilterSql(query, replacements, 'swr.created_at', 'swr');
  const chimeDateScope = buildDateFilterSql(query, replacements, 'cc.created_at', 'cc');
  const wrUserIdScope = buildUserIdFilterSql(query, replacements, 'wr.user_id');
  const speedUserIdScope = buildUserIdFilterSql(query, replacements, 'swr.user_id');
  const chimeUserIdScope = buildUserIdFilterSql(query, replacements, 'cc.user_id');

  const unionBody = `
    SELECT
      ('wr:' || wr.id)::text AS uid,
      'wallet'::text AS source_kind,
      wr.id AS source_id,
      wr.created_at,
      wr.user_id,
      wr.amount::numeric AS amount,
      COALESCE(NULLIF(TRIM(wr.currency), ''), 'USD') AS currency,
      wr.status,
      COALESCE(NULLIF(TRIM(wr.method), ''), '') AS method_or_payout,
      COALESCE(NULLIF(TRIM(wr.routing_type), ''), '') AS routing_or_provider,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      wr.approved_by_user_id,
      NULL::timestamptz AS approved_at,
      abu.username AS approver_username,
      abu.email AS approver_email,
      abu.first_name AS approver_first_name,
      abu.last_name AS approver_last_name,
      abu.role AS approver_role,
      aar.name AS approver_admin_role_name,
      asr.name AS approver_store_role_name
    FROM withdrawal_requests wr
    INNER JOIN users u ON u.user_id = wr.user_id
    LEFT JOIN users abu ON abu.user_id = wr.approved_by_user_id
    LEFT JOIN admin_roles aar ON aar.id = abu.admin_role_id
    LEFT JOIN store_roles asr ON asr.id = abu.store_role_id
    WHERE 1 = 1
    ${userScope}
    ${wrUserIdScope}
    ${wrDateScope}

    UNION ALL

    SELECT
      ('speed:' || swr.id)::text AS uid,
      'speed'::text AS source_kind,
      swr.id AS source_id,
      swr.created_at,
      swr.user_id,
      swr.amount::numeric AS amount,
      COALESCE(NULLIF(TRIM(swr.currency), ''), 'USD') AS currency,
      swr.status,
      'crypto'::text AS method_or_payout,
      COALESCE(NULLIF(TRIM(swr.provider), ''), 'scrypto') AS routing_or_provider,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      NULL::integer AS approved_by_user_id,
      NULL::timestamptz AS approved_at,
      NULL::varchar AS approver_username,
      NULL::varchar AS approver_email,
      NULL::varchar AS approver_first_name,
      NULL::varchar AS approver_last_name,
      NULL::varchar AS approver_role,
      NULL::varchar AS approver_admin_role_name,
      NULL::varchar AS approver_store_role_name
    FROM speed_withdraw_requests swr
    INNER JOIN users u ON u.user_id = swr.user_id
    WHERE 1 = 1
    ${userScope}
    ${speedUserIdScope}
    ${speedDateScope}

    UNION ALL

    SELECT
      ('chime:' || cc.id)::text AS uid,
      'manual_chime'::text AS source_kind,
      cc.id AS source_id,
      cc.created_at,
      cc.user_id,
      cc.amount::numeric AS amount,
      COALESCE(NULLIF(TRIM(cc.currency), ''), 'USD') AS currency,
      cc.status,
      COALESCE(NULLIF(TRIM(cc.payout_type), ''), '') AS method_or_payout,
      ''::text AS routing_or_provider,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      cc.approved_by_user_id,
      cc.approved_at,
      abu.username AS approver_username,
      abu.email AS approver_email,
      abu.first_name AS approver_first_name,
      abu.last_name AS approver_last_name,
      abu.role AS approver_role,
      aar.name AS approver_admin_role_name,
      asr.name AS approver_store_role_name
    FROM chime_cashapp_withdrawal_requests cc
    LEFT JOIN users u ON u.user_id = cc.user_id
    LEFT JOIN users abu ON abu.user_id = cc.approved_by_user_id
    LEFT JOIN admin_roles aar ON aar.id = abu.admin_role_id
    LEFT JOIN store_roles asr ON asr.id = abu.store_role_id
    WHERE 1 = 1
    ${chimeScope}
    ${chimeUserIdScope}
    ${chimeDateScope}
  `;

  const countSql = `SELECT COUNT(*)::int AS total FROM (${unionBody}) AS merged`;

  const listSql = `
    SELECT * FROM (${unionBody}) AS merged
    ORDER BY merged.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  const countResult = await db.sequelize.query(countSql, {
    replacements,
    type: QueryTypes.SELECT
  });
  const totalRow = Array.isArray(countResult) ? countResult[0] : countResult;
  const total = totalRow && totalRow.total != null ? Number(totalRow.total) : 0;

  const rows = await db.sequelize.query(listSql, {
    replacements,
    type: QueryTypes.SELECT
  });

  const list = (rows || []).map((r) => serializeMergedRow(r, req.role));

  const sumReplacements = {};
  const sumUserScope = buildUserJoinScope(req, query, sumReplacements);
  const sumChimeScope = buildChimeWhere(req, query, sumReplacements);
  const sumWrDateScope = buildDateFilterSql(query, sumReplacements, 'wr.created_at', 'sumWr');
  const sumChimeDateScope = buildDateFilterSql(query, sumReplacements, 'cc.created_at', 'sumCc');
  const sumWrUserIdScope = buildUserIdFilterSql(query, sumReplacements, 'wr.user_id');
  const sumChimeUserIdScope = buildUserIdFilterSql(query, sumReplacements, 'cc.user_id');
  const payoutFeeJoinUsers = buildStoreFeeJoinSql({
    storeExpr: 'u.store_code',
    distExpr: 'u.distributor_code',
    kind: 'payout',
    prefix: 'payout'
  });
  const payoutFeeJoinCc = buildStoreFeeJoinSql({
    storeExpr: 'COALESCE(cc.store_code, u.store_code)',
    distExpr: 'COALESCE(cc.distributor_code, u.distributor_code)',
    kind: 'payout',
    prefix: 'payout'
  });
  const wrCompletedFee = completedFeeSql(
    'wr.amount',
    `LOWER(COALESCE(wr.status, '')) IN ('completed', 'success', 'paid')`,
    'payout'
  );
  const ccFee = (extraSql) => completedFeeSql(
    'cc.amount',
    `LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND ${extraSql}`,
    'payout'
  );
  const summarySql = `
    WITH wr_sum AS (
      SELECT
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(wr.status, '')) IN ('completed', 'success') THEN wr.amount ELSE 0 END), 0)::float AS "orionCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(wr.status, '')) IN ('pending', 'processing') THEN wr.amount ELSE 0 END), 0)::float AS "orionPendingAmount",
        COALESCE(SUM(${wrCompletedFee}), 0)::float AS "orionCompletedFee"
      FROM withdrawal_requests wr
      INNER JOIN users u ON u.user_id = wr.user_id
      ${payoutFeeJoinUsers}
      WHERE 1 = 1
      ${sumUserScope}
      ${sumWrUserIdScope}
      ${sumWrDateScope}
    ),
    cc_sum AS (
      SELECT
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payout_type, '')) = 'chime' AND LOWER(COALESCE(cc.payment_provider, '')) NOT IN ('dollarpay', 'xxpay') THEN cc.amount ELSE 0 END), 0)::float AS "chimeCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payout_type, '')) = 'chime' AND LOWER(COALESCE(cc.payment_provider, '')) NOT IN ('dollarpay', 'xxpay') THEN cc.amount ELSE 0 END), 0)::float AS "chimePendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payout_type, '')) = 'chime' AND LOWER(COALESCE(cc.payment_provider, '')) NOT IN ('dollarpay', 'xxpay')`)}), 0)::float AS "chimeCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' AND LOWER(COALESCE(cc.payment_provider, '')) NOT IN ('dollarpay', 'xxpay') THEN cc.amount ELSE 0 END), 0)::float AS "cashappCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' AND LOWER(COALESCE(cc.payment_provider, '')) NOT IN ('dollarpay', 'xxpay') THEN cc.amount ELSE 0 END), 0)::float AS "cashappPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' AND LOWER(COALESCE(cc.payment_provider, '')) NOT IN ('dollarpay', 'xxpay')`)}), 0)::float AS "cashappCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay'`)}), 0)::float AS "dollarpayCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'chime' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayChimeCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'chime' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayChimePendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'chime'`)}), 0)::float AS "dollarpayChimeCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayCashappCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayCashappPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp'`)}), 0)::float AS "dollarpayCashappCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'paypal' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayPaypalCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'paypal' THEN cc.amount ELSE 0 END), 0)::float AS "dollarpayPaypalPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'dollarpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'paypal'`)}), 0)::float AS "dollarpayPaypalCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay'`)}), 0)::float AS "xxpayCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'chime' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayChimeCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'chime' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayChimePendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'chime'`)}), 0)::float AS "xxpayChimeCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayCashappCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayCashappPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'cashapp'`)}), 0)::float AS "xxpayCashappCompletedFee",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('completed', 'success') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'paypal' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayPaypalCompletedAmount",
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(cc.status, '')) IN ('pending', 'processing') AND LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'paypal' THEN cc.amount ELSE 0 END), 0)::float AS "xxpayPaypalPendingAmount",
        COALESCE(SUM(${ccFee(`LOWER(COALESCE(cc.payment_provider, '')) = 'xxpay' AND LOWER(COALESCE(cc.payout_type, '')) = 'paypal'`)}), 0)::float AS "xxpayPaypalCompletedFee"
      FROM chime_cashapp_withdrawal_requests cc
      LEFT JOIN users u ON u.user_id = cc.user_id
      ${payoutFeeJoinCc}
      WHERE 1 = 1
      ${sumChimeScope}
      ${sumChimeUserIdScope}
      ${sumChimeDateScope}
    )
    SELECT
      wr_sum."orionCompletedAmount",
      wr_sum."orionPendingAmount",
      wr_sum."orionCompletedFee",
      cc_sum."chimeCompletedAmount",
      cc_sum."chimePendingAmount",
      cc_sum."chimeCompletedFee",
      cc_sum."cashappCompletedAmount",
      cc_sum."cashappPendingAmount",
      cc_sum."cashappCompletedFee",
      cc_sum."dollarpayCompletedAmount",
      cc_sum."dollarpayPendingAmount",
      cc_sum."dollarpayCompletedFee",
      cc_sum."dollarpayChimeCompletedAmount",
      cc_sum."dollarpayChimePendingAmount",
      cc_sum."dollarpayChimeCompletedFee",
      cc_sum."dollarpayCashappCompletedAmount",
      cc_sum."dollarpayCashappPendingAmount",
      cc_sum."dollarpayCashappCompletedFee",
      cc_sum."dollarpayPaypalCompletedAmount",
      cc_sum."dollarpayPaypalPendingAmount",
      cc_sum."dollarpayPaypalCompletedFee",
      cc_sum."xxpayCompletedAmount",
      cc_sum."xxpayPendingAmount",
      cc_sum."xxpayCompletedFee",
      cc_sum."xxpayChimeCompletedAmount",
      cc_sum."xxpayChimePendingAmount",
      cc_sum."xxpayChimeCompletedFee",
      cc_sum."xxpayCashappCompletedAmount",
      cc_sum."xxpayCashappPendingAmount",
      cc_sum."xxpayCashappCompletedFee",
      cc_sum."xxpayPaypalCompletedAmount",
      cc_sum."xxpayPaypalPendingAmount",
      cc_sum."xxpayPaypalCompletedFee"
    FROM wr_sum, cc_sum
  `;
  const totalsSql = `
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(merged.status, '')) IN ('completed', 'success', 'paid') THEN merged.amount ELSE 0 END), 0)::float AS "completedAmount",
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(merged.status, '')) IN ('pending', 'processing', 'active') THEN merged.amount ELSE 0 END), 0)::float AS "pendingAmount",
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(merged.status, '')) IN ('failed', 'fail') THEN merged.amount ELSE 0 END), 0)::float AS "failedAmount",
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(merged.status, '')) IN ('rejected', 'cancelled', 'canceled') THEN merged.amount ELSE 0 END), 0)::float AS "rejectedAmount",
      COALESCE(SUM(merged.amount), 0)::float AS "allAmount"
    FROM (${unionBody}) AS merged
  `;

  const [summaryRows, totalsRows] = await Promise.all([
    db.sequelize.query(summarySql, {
      replacements: sumReplacements,
      type: QueryTypes.SELECT
    }),
    db.sequelize.query(totalsSql, {
      replacements,
      type: QueryTypes.SELECT
    })
  ]);
  const summaryRow = summaryRows?.[0] || {};
  const totalsRow = totalsRows?.[0] || {};
  const summary = {
    orionstarspay: {
      completedAmount: Number(summaryRow.orionCompletedAmount) || 0,
      pendingAmount: Number(summaryRow.orionPendingAmount) || 0,
      completedFee: Number(summaryRow.orionCompletedFee) || 0
    },
    chime: {
      completedAmount: Number(summaryRow.chimeCompletedAmount) || 0,
      pendingAmount: Number(summaryRow.chimePendingAmount) || 0,
      completedFee: Number(summaryRow.chimeCompletedFee) || 0
    },
    cashapp: {
      completedAmount: Number(summaryRow.cashappCompletedAmount) || 0,
      pendingAmount: Number(summaryRow.cashappPendingAmount) || 0,
      completedFee: Number(summaryRow.cashappCompletedFee) || 0
    },
    dollarpay: {
      completedAmount: Number(summaryRow.dollarpayCompletedAmount) || 0,
      pendingAmount: Number(summaryRow.dollarpayPendingAmount) || 0,
      completedFee: Number(summaryRow.dollarpayCompletedFee) || 0,
      chime: {
        completedAmount: Number(summaryRow.dollarpayChimeCompletedAmount) || 0,
        pendingAmount: Number(summaryRow.dollarpayChimePendingAmount) || 0,
        completedFee: Number(summaryRow.dollarpayChimeCompletedFee) || 0
      },
      cashapp: {
        completedAmount: Number(summaryRow.dollarpayCashappCompletedAmount) || 0,
        pendingAmount: Number(summaryRow.dollarpayCashappPendingAmount) || 0,
        completedFee: Number(summaryRow.dollarpayCashappCompletedFee) || 0
      },
      paypal: {
        completedAmount: Number(summaryRow.dollarpayPaypalCompletedAmount) || 0,
        pendingAmount: Number(summaryRow.dollarpayPaypalPendingAmount) || 0,
        completedFee: Number(summaryRow.dollarpayPaypalCompletedFee) || 0
      }
    },
    xxpay: {
      completedAmount: Number(summaryRow.xxpayCompletedAmount) || 0,
      pendingAmount: Number(summaryRow.xxpayPendingAmount) || 0,
      completedFee: Number(summaryRow.xxpayCompletedFee) || 0,
      chime: {
        completedAmount: Number(summaryRow.xxpayChimeCompletedAmount) || 0,
        pendingAmount: Number(summaryRow.xxpayChimePendingAmount) || 0,
        completedFee: Number(summaryRow.xxpayChimeCompletedFee) || 0
      },
      cashapp: {
        completedAmount: Number(summaryRow.xxpayCashappCompletedAmount) || 0,
        pendingAmount: Number(summaryRow.xxpayCashappPendingAmount) || 0,
        completedFee: Number(summaryRow.xxpayCashappCompletedFee) || 0
      },
      paypal: {
        completedAmount: Number(summaryRow.xxpayPaypalCompletedAmount) || 0,
        pendingAmount: Number(summaryRow.xxpayPaypalPendingAmount) || 0,
        completedFee: Number(summaryRow.xxpayPaypalCompletedFee) || 0
      }
    }
  };

  const totals = {
    count: total,
    completedAmount: Number(totalsRow.completedAmount) || 0,
    pendingAmount: Number(totalsRow.pendingAmount) || 0,
    failedAmount: Number(totalsRow.failedAmount) || 0,
    rejectedAmount: Number(totalsRow.rejectedAmount) || 0,
    allAmount: Number(totalsRow.allAmount) || 0
  };

  return {
    success: true,
    list,
    total,
    page,
    limit,
    summary,
    totals
  };
}

module.exports = { listWithdrawalRequestsAdmin };
