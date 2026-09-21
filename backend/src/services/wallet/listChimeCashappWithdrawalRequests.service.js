const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { canAccessRequest } = require('./approveChimeCashappWithdrawalRequest.service');
const {
  APPROVER_USER_ATTRS,
  approverUserNestedIncludes,
  buildApproverPayload
} = require('../../utils/approverUserPayload');
const { omitPlayerEmailAttr, stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');
const { findUserIdsWithCompletedCashDeposit } = require('./neverDepositedWithdraw.service');

const approverUserInclude = {
  model: db.User,
  as: 'ApprovedByUser',
  attributes: APPROVER_USER_ATTRS,
  required: false,
  include: approverUserNestedIncludes(db)
};

function serializeRow(r, includeUser, role = null) {
  const paymentProvider = r.paymentProvider ? String(r.paymentProvider).toLowerCase() : null;
  const isAutomated = paymentProvider === 'dollarpay' || paymentProvider === 'xxpay';
  const item = {
    id: r.id,
    userId: r.userId,
    amount: Number(r.amount),
    currency: r.currency,
    payoutType: r.payoutType,
    destinationUsername: r.destinationUsername,
    paymentProvider,
    payoutMode: isAutomated ? 'automatic' : 'manual',
    status: r.status,
    rejectionReason: r.rejectionReason || null,
    storeCode: r.storeCode,
    distributorCode: r.distributorCode,
    approvedByUserId: r.approvedByUserId != null ? Number(r.approvedByUserId) : null,
    approvedBy: buildApproverPayload(r.ApprovedByUser),
    approvedAt: r.approvedAt || r.approved_at || null,
    paidFromTag: r.paidFromTag ? String(r.paidFromTag) : null,
    createdAt: r.createdAt || r.created_at,
    updatedAt: r.updatedAt || r.updated_at,
    neverDeposited: false
  };
  if (includeUser && r.User) {
    item.user = stripPlayerEmailFields({
      userId: r.User.userId,
      username: r.User.username,
      email: r.User.email,
      firstName: r.User.firstName,
      lastName: r.User.lastName
    }, role);
  }
  return item;
}

/** Logged-in player: own requests only. */
async function listChimeCashappWithdrawalRequestsForUser(userId, query = {}) {
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 50), 100);
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const where = { userId };
  if (query.status) where.status = String(query.status).trim();

  // Settle any DollarPay / XXPay payouts stuck in processing (webhook miss).
  try {
    const { syncDollarpayWithdrawalStatus } = require('./settleDollarpayWithdrawal.service');
    const { syncXxpayWithdrawalStatus } = require('./syncProcessingXxpayWithdrawals.service');
    const processing = await db.ChimeCashappWithdrawalRequest.findAll({
      where: {
        userId,
        status: 'processing',
        paymentProvider: { [Op.in]: ['dollarpay', 'xxpay'] }
      },
      limit: 20
    });
    for (const row of processing) {
      const provider = String(row.paymentProvider || '').toLowerCase();
      if (provider === 'xxpay') await syncXxpayWithdrawalStatus(row).catch(() => {});
      else await syncDollarpayWithdrawalStatus(row).catch(() => {});
    }
  } catch (_) {
    // non-fatal
  }

  const { rows, count } = await db.ChimeCashappWithdrawalRequest.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: [{ ...approverUserInclude }]
  });

  return {
    success: true,
    data: rows.map((r) => serializeRow(r, false)),
    total: count
  };
}

const { toDateRangeStart, toDateRangeEnd, buildDateTimeRangeFilterParts } = require('../../utils/dateRangeFilters');

/** Admin panel: scoped by role (store / distributor / master). */
async function listChimeCashappWithdrawalRequestsAdmin(req, query = {}) {
  const where = {};
  if (req.role === ROLES.STORE_ADMIN) {
    where.storeCode = req.storeCode;
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    where.distributorCode = req.distributorCode;
    const scDist = query.storeCode != null ? String(query.storeCode).trim() : '';
    if (scDist) {
      where.storeCode = scDist;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    if (query.storeCode) where.storeCode = String(query.storeCode).trim();
    if (query.distributorCode) where.distributorCode = String(query.distributorCode).trim();
  }

  if (query.status) where.status = String(query.status).trim();
  else if (query.pendingOnly === '1' || query.pendingOnly === 'true') {
    where.status = { [Op.in]: ['pending', 'processing'] };
  }

  const payoutTypeRaw = query.payoutType != null ? query.payoutType : query.paymentMethod;
  const payoutTypes = String(payoutTypeRaw || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => ['chime', 'cashapp', 'paypal', 'venmo', 'zelle', 'card', 'bank_transfer'].includes(t));
  if (payoutTypes.length === 1) where.payoutType = payoutTypes[0];
  else if (payoutTypes.length > 1) where.payoutType = { [Op.in]: payoutTypes };

  const providerRaw = query.paymentProvider != null ? query.paymentProvider : query.provider;
  const providerKey = providerRaw != null ? String(providerRaw).trim().toLowerCase() : '';
  if (providerKey === 'dollarpay' || providerKey === 'xxpay') {
    where.paymentProvider = providerKey;
  } else if (
    providerKey === 'manual' ||
    providerKey === 'staff' ||
    providerKey === 'manual_chime'
  ) {
    // Manual / staff-paid rows store null (or legacy non-automated values).
    where[Op.and] = [
      ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
      {
        [Op.or]: [
          { paymentProvider: null },
          { paymentProvider: { [Op.notIn]: ['dollarpay', 'xxpay'] } }
        ]
      }
    ];
  }

  // Settle DollarPay / XXPay processing rows before listing (covers missed webhooks).
  try {
    const { syncDollarpayWithdrawalStatus } = require('./settleDollarpayWithdrawal.service');
    const { syncXxpayWithdrawalStatus } = require('./syncProcessingXxpayWithdrawals.service');
    const processingWhere = {
      ...where,
      status: 'processing',
      paymentProvider: { [Op.in]: ['dollarpay', 'xxpay'] }
    };
    const processing = await db.ChimeCashappWithdrawalRequest.findAll({
      where: processingWhere,
      limit: 40
    });
    for (const row of processing) {
      const provider = String(row.paymentProvider || '').toLowerCase();
      if (provider === 'xxpay') await syncXxpayWithdrawalStatus(row).catch(() => {});
      else await syncDollarpayWithdrawalStatus(row).catch(() => {});
    }
  } catch (_) {
    // non-fatal
  }

  const from = toDateRangeStart(query.startDate, query.timezoneOffset);
  const to = toDateRangeEnd(query.endDate, query.timezoneOffset);
  if (from || to) {
    const range = {};
    if (from) range[Op.gte] = from;
    if (to) range[Op.lte] = to;
    // For completed requests, filter by approval time
    if (query.status === 'completed') {
      where.approved_at = range;
    } else {
      where.created_at = range;
    }
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 100));
  const offset = (page - 1) * limit;

  const userAttrs = omitPlayerEmailAttr(
    ['userId', 'username', 'email', 'firstName', 'lastName'],
    req.role
  );

  const { rows, count } = await db.ChimeCashappWithdrawalRequest.findAndCountAll({
    where,
    order: [['updated_at', 'DESC']],
    limit,
    offset,
    include: [
      { model: db.User, as: 'User', attributes: userAttrs, required: false },
      { ...approverUserInclude }
    ]
  });

  const list = rows.map((r) => serializeRow(r, true, req.role));
  const depositedIds = await findUserIdsWithCompletedCashDeposit(list.map((item) => item.userId));
  for (const item of list) {
    item.neverDeposited = item.userId != null && !depositedIds.has(Number(item.userId));
  }

  return {
    success: true,
    list,
    total: count,
    page,
    limit
  };
}

/** Single row for admin detail — enforces scope. */
async function getChimeCashappWithdrawalRequestAdmin(requestId, req) {
  const userAttrs = omitPlayerEmailAttr(
    ['userId', 'username', 'email', 'firstName', 'lastName'],
    req.role
  );
  const row = await db.ChimeCashappWithdrawalRequest.findByPk(requestId, {
    include: [
      { model: db.User, as: 'User', attributes: userAttrs, required: false },
      { ...approverUserInclude }
    ]
  });
  if (!row) {
    const err = new Error('Request not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!canAccessRequest(req, row)) {
    const err = new Error('Forbidden.');
    err.statusCode = 403;
    throw err;
  }
  const item = serializeRow(row, true, req.role);
  if (item.userId != null) {
    const depositedIds = await findUserIdsWithCompletedCashDeposit([item.userId]);
    item.neverDeposited = !depositedIds.has(Number(item.userId));
  }
  return item;
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function adminWithdrawalScopeWhere(req, query = {}) {
  const where = {};
  if (req.role === ROLES.STORE_ADMIN) {
    where.storeCode = req.storeCode;
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    where.distributorCode = req.distributorCode;
    if (query.storeCode) where.storeCode = String(query.storeCode).trim();
  } else if (req.role === ROLES.MASTER_ADMIN) {
    if (query.storeCode) where.storeCode = String(query.storeCode).trim();
    if (query.distributorCode) where.distributorCode = String(query.distributorCode).trim();
  }
  return where;
}

/**
 * Completed manual Chime/Cash App withdrawals grouped by staff paid-from tag.
 * Date window uses approved_at (when staff paid).
 */
async function getChimeCashappWithdrawalAccountTotalsAdmin(req, query = {}) {
  const replacements = {};
  const parts = [
    `LOWER(COALESCE(status, '')) = 'completed'`,
    `LOWER(COALESCE(payout_type, '')) IN ('chime', 'cashapp')`,
    `(payment_provider IS NULL OR LOWER(payment_provider) NOT IN ('dollarpay', 'xxpay'))`
  ];
  const scope = adminWithdrawalScopeWhere(req, query);
  if (scope.storeCode) {
    parts.push('store_code = :filterStoreCode');
    replacements.filterStoreCode = scope.storeCode;
  }
  if (scope.distributorCode) {
    parts.push('distributor_code = :filterDistributorCode');
    replacements.filterDistributorCode = scope.distributorCode;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'approved_at', 'tot'));

  const tag = String(query.username ?? query.paidFromTag ?? query.tag ?? '').trim().slice(0, 64);
  if (tag) {
    const safe = tag.replace(/[%_]/g, '');
    if (safe) {
      parts.push('paid_from_tag ILIKE :filterTag');
      replacements.filterTag = `%${safe}%`;
    }
  }

  const includeStore = req.role === ROLES.MASTER_ADMIN || req.role === ROLES.DISTRIBUTOR_ADMIN;
  const extraSelect = includeStore
    ? ', store_code AS "storeCode", distributor_code AS "distributorCode"'
    : '';
  const groupSql = includeStore
    ? 'LOWER(TRIM(COALESCE(paid_from_tag, \'\'))), store_code, distributor_code'
    : 'LOWER(TRIM(COALESCE(paid_from_tag, \'\')))';

  const rows = await db.sequelize.query(
    `
    SELECT
      MAX(paid_from_tag) AS "paidFromTag",
      MAX(currency) AS currency,
      COALESCE(SUM(amount), 0)::float AS "totalAmount",
      COUNT(id)::int AS "payoutCount",
      MAX(approved_at) AS "lastPaidAt"
      ${extraSelect}
    FROM chime_cashapp_withdrawal_requests
    WHERE ${parts.join(' AND ')}
    GROUP BY ${groupSql}
    ORDER BY SUM(amount) DESC
    `,
    { replacements, type: db.Sequelize.QueryTypes.SELECT }
  );

  const list = (rows || []).map((r) => {
    const name = r.paidFromTag != null ? String(r.paidFromTag).trim() : '';
    return {
      paidFromTag: name || null,
      storeCode: includeStore ? r.storeCode || null : undefined,
      distributorCode: includeStore ? r.distributorCode || null : undefined,
      currency: r.currency || 'USD',
      totalAmount: toMoney(r.totalAmount),
      payoutCount: Number(r.payoutCount) || 0,
      lastPaidAt: r.lastPaidAt || null
    };
  });

  const totalAmount = list.reduce((sum, row) => sum + row.totalAmount, 0);
  const payoutCount = list.reduce((sum, row) => sum + row.payoutCount, 0);

  let stores = [];
  if (includeStore) {
    const storeRows = await db.ChimeCashappWithdrawalRequest.findAll({
      where: {
        ...adminWithdrawalScopeWhere(req, {}),
        status: 'completed',
        payoutType: { [Op.in]: ['chime', 'cashapp'] }
      },
      attributes: ['storeCode'],
      group: ['storeCode'],
      order: [['storeCode', 'ASC']],
      raw: true
    });
    stores = (storeRows || []).map((r) => r.storeCode).filter(Boolean);
  }

  return {
    success: true,
    list,
    stores,
    summary: {
      currency: 'USD',
      totalAmount: toMoney(totalAmount),
      payoutCount,
      accountCount: list.length
    }
  };
}

module.exports = {
  listChimeCashappWithdrawalRequestsForUser,
  listChimeCashappWithdrawalRequestsAdmin,
  getChimeCashappWithdrawalRequestAdmin,
  getChimeCashappWithdrawalAccountTotalsAdmin
};
