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

const approverUserInclude = {
  model: db.User,
  as: 'ApprovedByUser',
  attributes: APPROVER_USER_ATTRS,
  required: false,
  include: approverUserNestedIncludes(db)
};

function serializeRow(r, includeUser, role = null) {
  const item = {
    id: r.id,
    userId: r.userId,
    amount: Number(r.amount),
    currency: r.currency,
    depositType: r.depositType,
    sourceUsername: r.sourceUsername,
    destinationUsername: r.destinationUsername != null ? String(r.destinationUsername) : null,
    status: r.status,
    rejectionReason: r.rejectionReason || null,
    storeCode: r.storeCode,
    distributorCode: r.distributorCode,
    approvedByUserId: r.approvedByUserId != null ? Number(r.approvedByUserId) : null,
    approvedBy: buildApproverPayload(r.ApprovedByUser),
    approvedAt: r.approvedAt || r.approved_at || null,
    createdAt: r.createdAt || r.created_at,
    updatedAt: r.updatedAt || r.updated_at
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

async function listChimeDepositRequestsForUser(userId, query = {}) {
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 50), 100);
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const where = { userId };
  if (query.status) where.status = String(query.status).trim();

  const { rows, count } = await db.ChimeDepositRequest.findAndCountAll({
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

const {
  toDateRangeStart,
  toDateRangeEnd,
  buildDateTimeRangeFilterParts
} = require('../../utils/dateRangeFilters');

function adminChimeDepositScopeWhere(req, query = {}) {
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

async function listChimeDepositRequestsAdmin(req, query = {}) {
  const where = adminChimeDepositScopeWhere(req, query);

  if (query.status) where.status = String(query.status).trim();
  else if (query.pendingOnly === '1' || query.pendingOnly === 'true') where.status = 'pending';

  const from = toDateRangeStart(query.startDate);
  const to = toDateRangeEnd(query.endDate);
  if (from || to) {
    const range = {};
    if (from) range[Op.gte] = from;
    if (to) range[Op.lte] = to;
    if (query.status === 'completed') {
      where.approved_at = range;
    } else {
      where.created_at = range;
    }
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const userAttrs = omitPlayerEmailAttr(
    ['userId', 'username', 'email', 'firstName', 'lastName'],
    req.role
  );

  const { rows, count } = await db.ChimeDepositRequest.findAndCountAll({
    where,
    order: [['updated_at', 'DESC']],
    limit,
    offset,
    include: [
      { model: db.User, as: 'User', attributes: userAttrs, required: false },
      { ...approverUserInclude }
    ]
  });

  return {
    success: true,
    list: rows.map((r) => serializeRow(r, true, req.role)),
    total: count,
    page,
    limit
  };
}

async function getChimeDepositRequestAdmin(requestId, req) {
  const userAttrs = omitPlayerEmailAttr(
    ['userId', 'username', 'email', 'firstName', 'lastName'],
    req.role
  );
  const row = await db.ChimeDepositRequest.findByPk(requestId, {
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
  return serializeRow(row, true, req.role);
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Completed Chime deposits grouped by pay-to username.
 * Date window matches dashboard payment totals: created_at + local timezone / time.
 */
async function getChimeDepositAccountTotalsAdmin(req, query = {}) {
  const replacements = {};
  const parts = [`LOWER(COALESCE(status, '')) = 'completed'`];
  const scope = adminChimeDepositScopeWhere(req, query);
  if (scope.storeCode) {
    parts.push('store_code = :filterStoreCode');
    replacements.filterStoreCode = scope.storeCode;
  }
  if (scope.distributorCode) {
    parts.push('distributor_code = :filterDistributorCode');
    replacements.filterDistributorCode = scope.distributorCode;
  }
  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'created_at', 'tot'));

  const username = String(query.username ?? query.destinationUsername ?? '').trim().slice(0, 64);
  if (username) {
    const safe = username.replace(/[%_]/g, '');
    if (safe) {
      parts.push('destination_username ILIKE :filterUsername');
      replacements.filterUsername = `%${safe}%`;
    }
  }

  const includeStore = req.role === ROLES.MASTER_ADMIN || req.role === ROLES.DISTRIBUTOR_ADMIN;
  const extraSelect = includeStore
    ? ', store_code AS "storeCode", distributor_code AS "distributorCode"'
    : '';
  const groupSql = includeStore
    ? 'LOWER(TRIM(destination_username)), store_code, distributor_code'
    : 'LOWER(TRIM(destination_username))';

  const rows = await db.sequelize.query(
    `
    SELECT
      MAX(destination_username) AS "destinationUsername",
      MAX(currency) AS currency,
      COALESCE(SUM(amount), 0)::float AS "totalAmount",
      COUNT(id)::int AS "depositCount",
      MAX(approved_at) AS "lastReceivedAt"
      ${extraSelect}
    FROM chime_deposit_requests
    WHERE ${parts.join(' AND ')}
    GROUP BY ${groupSql}
    ORDER BY SUM(amount) DESC
    `,
    { replacements, type: db.Sequelize.QueryTypes.SELECT }
  );

  const list = (rows || []).map((r) => {
    const name = r.destinationUsername != null ? String(r.destinationUsername).trim() : '';
    return {
      destinationUsername: name || null,
      storeCode: includeStore ? r.storeCode || null : undefined,
      distributorCode: includeStore ? r.distributorCode || null : undefined,
      currency: r.currency || 'USD',
      totalAmount: toMoney(r.totalAmount),
      depositCount: Number(r.depositCount) || 0,
      lastReceivedAt: r.lastReceivedAt || null
    };
  });

  const totalAmount = list.reduce((sum, row) => sum + row.totalAmount, 0);
  const depositCount = list.reduce((sum, row) => sum + row.depositCount, 0);

  let stores = [];
  if (includeStore) {
    const storeRows = await db.ChimeDepositRequest.findAll({
      where: {
        ...adminChimeDepositScopeWhere(req, {}),
        status: 'completed'
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
      depositCount,
      accountCount: list.length
    }
  };
}

module.exports = {
  listChimeDepositRequestsForUser,
  listChimeDepositRequestsAdmin,
  getChimeDepositRequestAdmin,
  getChimeDepositAccountTotalsAdmin
};
