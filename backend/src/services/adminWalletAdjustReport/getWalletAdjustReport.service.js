'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { ROLES } = require('../../constants/roles');
const {
  WALLET_ADJUST_TX_TYPES,
  TYPE_LABELS,
  TYPE_HINTS,
  WALLET_OPTIONS,
  ROLE_LABELS
} = require('./walletAdjustReport.constants');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function resolveDateRange(startDate, endDate, timezoneOffset) {
  const normalizedStart =
    startDate && String(startDate).trim() && String(startDate).trim() !== 'undefined'
      ? String(startDate).trim()
      : null;
  const normalizedEnd =
    endDate && String(endDate).trim() && String(endDate).trim() !== 'undefined'
      ? String(endDate).trim()
      : null;
  const defaults = defaultDateRange();
  const rangeStart = normalizedStart || defaults.startDate;
  const rangeEnd = normalizedEnd || defaults.endDate;
  return {
    rangeStart,
    rangeEnd,
    from: toDateRangeStart(rangeStart, timezoneOffset),
    to: toDateRangeEnd(rangeEnd, timezoneOffset)
  };
}

function parseTypes(typeParam) {
  if (typeParam == null || typeParam === '' || typeParam === 'all') return [...WALLET_ADJUST_TX_TYPES];
  const arr = Array.isArray(typeParam)
    ? typeParam
    : String(typeParam).split(',').map((t) => t.trim()).filter(Boolean);
  const filtered = arr.filter((t) => WALLET_ADJUST_TX_TYPES.includes(t));
  return filtered.length > 0 ? filtered : [...WALLET_ADJUST_TX_TYPES];
}

function parseWallet(walletParam) {
  if (walletParam == null || walletParam === '' || walletParam === 'all') return null;
  const w = String(walletParam).trim().toUpperCase();
  const allowed = WALLET_OPTIONS.map((o) => o.value);
  return allowed.includes(w) ? w : null;
}

function displayName(u) {
  if (!u) return null;
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return u.username || fullName || u.email || u.phone || null;
}

function handlerRoleLabel(handler) {
  if (!handler) return null;
  if (handler.role === ROLES.MASTER_ADMIN) {
    if (handler.adminRoleId) {
      return handler.AdminRole?.name
        ? `Technical staff (${handler.AdminRole.name})`
        : 'Technical staff';
    }
    return 'Super admin';
  }
  if (handler.role === ROLES.STORE_ADMIN) {
    if (handler.storeRoleId) {
      return handler.StoreRole?.name
        ? `Store staff (${handler.StoreRole.name})`
        : 'Store staff';
    }
    return 'Store admin';
  }
  if (handler.role === ROLES.DISTRIBUTOR_ADMIN) return 'Distributor admin';
  return ROLE_LABELS[handler.role] || handler.role || null;
}

async function resolveUserIds({ filterStoreCode }) {
  const where = { role: ROLES.USER };
  if (filterStoreCode) where.storeCode = String(filterStoreCode).trim();

  const users = await db.User.findAll({
    where,
    attributes: ['userId'],
    raw: true
  });
  return (users || []).map((u) => u.userId).filter((id) => id != null);
}

async function findHandlerIdsBySearch(searchTerm) {
  const like = { [Op.iLike]: `%${searchTerm}%` };
  const handlers = await db.User.findAll({
    where: {
      role: { [Op.in]: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN] },
      [Op.or]: [
        { username: like },
        { email: like },
        { phone: like },
        { firstName: like },
        { lastName: like }
      ]
    },
    attributes: ['userId'],
    raw: true
  });
  return (handlers || []).map((h) => h.userId).filter((id) => id != null);
}

function metadataAdminUserId(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata.adminUserId ?? metadata.admin_user_id ?? null;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function walletFromRow(r) {
  const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  if (metadata.wallet) return String(metadata.wallet).toUpperCase();
  return r.currencyCode ? String(r.currencyCode).toUpperCase() : null;
}

function reasonFromRow(r) {
  const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  if (r.type === 'admin_deduct') {
    return (metadata.reason && String(metadata.reason).trim()) || r.description || null;
  }
  return r.description || (metadata.description && String(metadata.description).trim()) || null;
}

function emptySummary() {
  return {
    totalAdded: 0,
    totalRemoved: 0,
    totalCount: 0,
    uniquePlayers: 0,
    uniqueHandlers: 0,
    byWallet: WALLET_OPTIONS.map((w) => ({
      wallet: w.value,
      label: w.label,
      hint: w.hint,
      added: 0,
      removed: 0,
      addCount: 0,
      deductCount: 0
    }))
  };
}

/**
 * Summary cards + breakdown for admin wallet add/remove activity.
 */
async function getWalletAdjustReportSummary({
  userIds,
  startDate,
  endDate,
  timezoneOffset,
  type,
  wallet,
  handlerUserIds
}) {
  if (!userIds || userIds.length === 0) return emptySummary();
  if (handlerUserIds && handlerUserIds.length === 0) return emptySummary();

  const types = parseTypes(type);
  const walletFilter = parseWallet(wallet);
  const { from, to } = resolveDateRange(startDate, endDate, timezoneOffset);
  if (!from || !to) return emptySummary();

  let sql = `
    SELECT type,
           COALESCE(UPPER(metadata->>'wallet'), UPPER(currency_code), 'SC') AS wallet,
           COALESCE(SUM(amount), 0)::float AS total,
           COUNT(*)::int AS cnt
    FROM user_transactions
    WHERE user_id IN (:userIds)
      AND type IN (:types)
      AND created_at >= :from
      AND created_at <= :to
  `;
  const replacements = { userIds, types, from, to };
  if (walletFilter) {
    sql += ` AND COALESCE(UPPER(metadata->>'wallet'), UPPER(currency_code), 'SC') = :walletFilter`;
    replacements.walletFilter = walletFilter;
  }
  if (handlerUserIds) {
    sql += ` AND (metadata->>'adminUserId')::bigint IN (:handlerUserIds)`;
    replacements.handlerUserIds = handlerUserIds;
  }
  sql += ` GROUP BY type, COALESCE(UPPER(metadata->>'wallet'), UPPER(currency_code), 'SC')`;

  const rows = await db.sequelize.query(sql, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT
  });

  const byMap = {};
  for (const opt of WALLET_OPTIONS) {
    byMap[opt.value] = { added: 0, removed: 0, addCount: 0, deductCount: 0 };
  }

  let totalAdded = 0;
  let totalRemoved = 0;
  let totalCount = 0;

  for (const r of rows || []) {
    const w = String(r.wallet || 'SC').toUpperCase();
    if (!byMap[w]) byMap[w] = { added: 0, removed: 0, addCount: 0, deductCount: 0 };
    const amount = Number(r.total) || 0;
    const cnt = Number(r.cnt) || 0;
    totalCount += cnt;
    if (r.type === 'admin_add') {
      byMap[w].added += amount;
      byMap[w].addCount += cnt;
      totalAdded += amount;
    } else if (r.type === 'admin_deduct') {
      byMap[w].removed += amount;
      byMap[w].deductCount += cnt;
      totalRemoved += amount;
    }
  }

  let uniqSql = `
    SELECT COUNT(DISTINCT user_id)::int AS players,
           COUNT(DISTINCT NULLIF(metadata->>'adminUserId', ''))::int AS handlers
    FROM user_transactions
    WHERE user_id IN (:userIds)
      AND type IN (:types)
      AND created_at >= :from
      AND created_at <= :to
  `;
  const uniqReplacements = { userIds, types, from, to };
  if (walletFilter) {
    uniqSql += ` AND COALESCE(UPPER(metadata->>'wallet'), UPPER(currency_code), 'SC') = :walletFilter`;
    uniqReplacements.walletFilter = walletFilter;
  }
  if (handlerUserIds) {
    uniqSql += ` AND (metadata->>'adminUserId')::bigint IN (:handlerUserIds)`;
    uniqReplacements.handlerUserIds = handlerUserIds;
  }
  const uniqRows = await db.sequelize.query(uniqSql, {
    replacements: uniqReplacements,
    type: db.Sequelize.QueryTypes.SELECT
  });

  return {
    totalAdded,
    totalRemoved,
    totalCount,
    uniquePlayers: Number(uniqRows?.[0]?.players) || 0,
    uniqueHandlers: Number(uniqRows?.[0]?.handlers) || 0,
    byWallet: WALLET_OPTIONS.map((opt) => ({
      wallet: opt.value,
      label: opt.label,
      hint: opt.hint,
      added: byMap[opt.value]?.added || 0,
      removed: byMap[opt.value]?.removed || 0,
      addCount: byMap[opt.value]?.addCount || 0,
      deductCount: byMap[opt.value]?.deductCount || 0
    }))
  };
}

/**
 * Paginated admin wallet add/remove list with handler details.
 */
async function getWalletAdjustReportTransactions({
  userIds,
  startDate,
  endDate,
  timezoneOffset,
  type,
  wallet,
  search,
  handlerSearch,
  page = 1,
  limit = DEFAULT_LIMIT
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const offset = (pageNum - 1) * limitNum;

  if (!userIds || userIds.length === 0) {
    return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
  }

  const types = parseTypes(type);
  const walletFilter = parseWallet(wallet);
  const { from, to } = resolveDateRange(startDate, endDate, timezoneOffset);
  if (!from || !to) {
    return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
  }

  let handlerUserIds = null;
  const handlerTerm = handlerSearch != null ? String(handlerSearch).trim() : '';
  if (handlerTerm) {
    handlerUserIds = await findHandlerIdsBySearch(handlerTerm);
    if (handlerUserIds.length === 0) {
      return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }
  }

  const whereAnd = [
    { userId: { [Op.in]: userIds } },
    { type: { [Op.in]: types } },
    { createdAt: { [Op.gte]: from, [Op.lte]: to } }
  ];

  if (walletFilter) {
    whereAnd.push(
      db.sequelize.literal(
        `COALESCE(UPPER(metadata->>'wallet'), UPPER(currency_code), 'SC') = ${db.sequelize.escape(walletFilter)}`
      )
    );
  }

  if (handlerUserIds) {
    const ids = handlerUserIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }
    whereAnd.push(
      db.sequelize.literal(`(metadata->>'adminUserId')::bigint IN (${ids.join(',')})`)
    );
  }

  const includeUser = {
    model: db.User,
    as: 'User',
    required: true,
    attributes: ['userId', 'username', 'email', 'firstName', 'lastName', 'phone', 'storeCode', 'distributorCode']
  };

  const searchTerm = search != null ? String(search).trim() : '';
  if (searchTerm) {
    const like = { [Op.iLike]: `%${searchTerm}%` };
    includeUser.where = {
      [Op.or]: [
        { username: like },
        { email: like },
        { phone: like },
        { firstName: like },
        { lastName: like }
      ]
    };
  }

  const { count, rows } = await db.UserTransaction.findAndCountAll({
    where: { [Op.and]: whereAnd },
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset,
    attributes: ['id', 'userId', 'type', 'amount', 'currencyCode', 'description', 'metadata', 'createdAt'],
    include: [includeUser],
    distinct: true
  });

  const adminIds = [...new Set(
    (rows || [])
      .map((r) => metadataAdminUserId(r.metadata))
      .filter((id) => id != null)
  )];

  const handlerMap = {};
  if (adminIds.length > 0) {
    const handlers = await db.User.findAll({
      where: { userId: { [Op.in]: adminIds } },
      attributes: [
        'userId',
        'username',
        'email',
        'firstName',
        'lastName',
        'phone',
        'role',
        'adminRoleId',
        'storeRoleId',
        'storeCode',
        'distributorCode'
      ],
      include: [
        { model: db.AdminRole, attributes: ['id', 'name'], required: false },
        { model: db.StoreRole, attributes: ['id', 'name'], required: false }
      ]
    });
    for (const h of handlers || []) {
      handlerMap[h.userId] = h;
    }
  }

  const rowsOut = (rows || []).map((r) => {
    const u = r.User || {};
    const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const adminUserId = metadataAdminUserId(metadata);
    const handler = adminUserId != null ? handlerMap[adminUserId] : null;
    const walletCode = walletFromRow(r);
    const funding = metadata.funding && typeof metadata.funding === 'object' ? metadata.funding : null;

    return {
      id: r.id,
      userId: r.userId,
      username: displayName(u) || String(r.userId),
      email: u.email || null,
      type: r.type,
      typeLabel: TYPE_LABELS[r.type] || r.type,
      typeHint: TYPE_HINTS[r.type] || '',
      amount: Number(r.amount),
      currencyCode: r.currencyCode || walletCode || 'SC',
      wallet: walletCode,
      walletLabel: WALLET_OPTIONS.find((o) => o.value === walletCode)?.label || walletCode || '—',
      description: r.description || null,
      reason: reasonFromRow(r),
      funding,
      createdAt: r.createdAt || r.created_at,
      storeCode: u.storeCode || null,
      distributorCode: u.distributorCode || null,
      handledBy: {
        userId: adminUserId,
        username: displayName(handler) || (adminUserId != null ? `user-${adminUserId}` : null),
        email: handler?.email || null,
        role: handler?.role || null,
        roleLabel: handlerRoleLabel(handler) || (adminUserId != null ? 'Unknown staff' : 'Unknown'),
        storeCode: handler?.storeCode || null
      }
    };
  });

  const total = count != null ? count : 0;
  return {
    rows: rowsOut,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 0
  };
}

async function getWalletAdjustReportFilterOptions() {
  const typeOptions = WALLET_ADJUST_TX_TYPES.map((t) => ({
    value: t,
    label: TYPE_LABELS[t] || t,
    hint: TYPE_HINTS[t] || ''
  }));

  const storeRows = await db.User.findAll({
    where: { role: ROLES.STORE_ADMIN },
    attributes: ['storeCode'],
    raw: true
  });
  const storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();

  return {
    typeOptions,
    walletOptions: WALLET_OPTIONS,
    storeCodes
  };
}

module.exports = {
  resolveUserIds,
  findHandlerIdsBySearch,
  getWalletAdjustReportSummary,
  getWalletAdjustReportTransactions,
  getWalletAdjustReportFilterOptions,
  WALLET_ADJUST_TX_TYPES,
  TYPE_LABELS,
  TYPE_HINTS,
  WALLET_OPTIONS
};
