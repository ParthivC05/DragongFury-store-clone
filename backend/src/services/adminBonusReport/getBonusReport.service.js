'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const {
  PACKAGE_EXTRA_TYPE,
  REAL_BONUS_TX_TYPES,
  BONUS_TX_TYPES,
  BONUS_TYPE_LABELS,
  BONUS_TYPE_HINTS
} = require('./bonusReport.constants');

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

/**
 * Parse type filter into real user_transactions types + whether to include package extra SC.
 */
function parseTypes(typeParam) {
  if (typeParam == null || typeParam === '') {
    return { realTypes: [...REAL_BONUS_TX_TYPES], includePackageExtra: true };
  }
  const arr = Array.isArray(typeParam)
    ? typeParam
    : String(typeParam).split(',').map((t) => t.trim()).filter(Boolean);
  const filtered = arr.filter((t) => BONUS_TX_TYPES.includes(t));
  const selected = filtered.length > 0 ? filtered : [...BONUS_TX_TYPES];
  return {
    realTypes: selected.filter((t) => t !== PACKAGE_EXTRA_TYPE),
    includePackageExtra: selected.includes(PACKAGE_EXTRA_TYPE)
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

/**
 * Resolve end-user IDs for master / store scope. Optional storeCode filter for master.
 */
async function resolveUserIds({ role, distributorCode, storeCode, filterStoreCode }) {
  const { ROLES } = require('../../constants/roles');
  const where = { role: ROLES.USER };

  if (role === ROLES.MASTER_ADMIN) {
    if (filterStoreCode) where.storeCode = String(filterStoreCode).trim();
  } else if (role === ROLES.STORE_ADMIN && distributorCode != null && storeCode != null) {
    where.distributorCode = distributorCode;
    where.storeCode = storeCode;
  } else {
    return [];
  }

  const users = await db.User.findAll({
    where,
    attributes: ['userId'],
    raw: true
  });
  return (users || []).map((u) => u.userId).filter((id) => id != null);
}

function displayName(u) {
  if (!u) return null;
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return u.username || fullName || u.email || u.phone || null;
}

/**
 * SQL expression: credit SC for a package deposit row (ut).
 */
function packageCreditSql(alias = 'ut') {
  return `COALESCE(
    NULLIF(${alias}.metadata->>'credit_sc', '')::numeric,
    NULLIF(${alias}.metadata->>'creditAmount', '')::numeric,
    ${alias}.amount
  )`;
}

/**
 * SQL expression: pay amount for a package deposit, recovering from order/pending/chime/catalog when metadata.pay_amount is missing (historical).
 */
function packagePaySql(alias = 'ut') {
  return `COALESCE(
    NULLIF(${alias}.metadata->>'pay_amount', '')::numeric,
    NULLIF(${alias}.metadata->>'payAmount', '')::numeric,
    (
      SELECT dpo.requested_amount
      FROM deposit_orders dpo
      WHERE dpo.id = NULLIF(${alias}.metadata->>'deposit_order_id', '')::bigint
      LIMIT 1
    ),
    (
      SELECT dpo.requested_amount
      FROM deposit_orders dpo
      WHERE dpo.user_id = ${alias}.user_id
        AND ${alias}.metadata->>'provider_transaction_id' IS NOT NULL
        AND (
          dpo.provider_transaction_id = ${alias}.metadata->>'provider_transaction_id'
          OR dpo.payment_link_token = ${alias}.metadata->>'provider_transaction_id'
        )
      ORDER BY dpo.id DESC
      LIMIT 1
    ),
    (
      SELECT ppd.amount
      FROM payment_pending_deposits ppd
      WHERE ppd.user_id = ${alias}.user_id
        AND ${alias}.metadata->>'provider_transaction_id' IS NOT NULL
        AND (
          ppd.provider_session_id = ${alias}.metadata->>'provider_transaction_id'
          OR ppd.provider_metadata->>'payOrderNo' = ${alias}.metadata->>'provider_transaction_id'
          OR ppd.provider_metadata->>'providerTransactionId' = ${alias}.metadata->>'provider_transaction_id'
          OR ppd.provider_metadata->>'outerOrderSn' = ${alias}.metadata->>'provider_transaction_id'
        )
      ORDER BY ppd.id DESC
      LIMIT 1
    ),
    (
      SELECT cdr.amount
      FROM chime_deposit_requests cdr
      WHERE cdr.status = 'completed'
        AND ${alias}.metadata->>'provider_transaction_id' IS NOT NULL
        AND ${alias}.metadata->>'provider_transaction_id' LIKE ('cdr-' || cdr.id::text || '-%')
      LIMIT 1
    ),
    (
      SELECT dp.final_price
      FROM deposit_packages dp
      WHERE dp.id = COALESCE(
        NULLIF(${alias}.metadata->>'package_id', '')::integer,
        NULLIF(${alias}.metadata->>'packageId', '')::integer
      )
      LIMIT 1
    )
  )`;
}

function packageExtraSql(alias = 'ut') {
  return `GREATEST(0, ${packageCreditSql(alias)} - ${packagePaySql(alias)})`;
}

/** Identify package deposit rows (historical + new) without changing credit logic. */
function packageDepositWhereSql(alias = 'ut') {
  return `(
    NULLIF(${alias}.metadata->>'package_id', '') IS NOT NULL
    OR NULLIF(${alias}.metadata->>'packageId', '') IS NOT NULL
  )`;
}

/**
 * Aggregate package-extra SC for the selected users / date range.
 */
async function getPackageExtraSummary({ userIds, from, to }) {
  if (!userIds || userIds.length === 0) {
    return { amount: 0, count: 0, userIds: [] };
  }

  const [aggRows, userRows] = await Promise.all([
    db.sequelize.query(
      `SELECT
          COALESCE(SUM(extra_sc), 0)::float AS total,
          COUNT(*)::int AS cnt
       FROM (
         SELECT ${packageExtraSql('ut')} AS extra_sc
         FROM user_transactions ut
         WHERE ut.user_id IN (:userIds)
           AND ut.type = 'deposit'
           AND ut.created_at >= :from
           AND ut.created_at <= :to
           AND ${packageDepositWhereSql('ut')}
       ) pkg
       WHERE pkg.extra_sc > 0`,
      {
        replacements: { userIds, from, to },
        type: db.Sequelize.QueryTypes.SELECT
      }
    ),
    db.sequelize.query(
      `SELECT DISTINCT ut.user_id AS "userId"
       FROM user_transactions ut
       WHERE ut.user_id IN (:userIds)
         AND ut.type = 'deposit'
         AND ut.created_at >= :from
         AND ut.created_at <= :to
         AND ${packageDepositWhereSql('ut')}
         AND ${packageExtraSql('ut')} > 0`,
      {
        replacements: { userIds, from, to },
        type: db.Sequelize.QueryTypes.SELECT
      }
    )
  ]);

  return {
    amount: Number(aggRows?.[0]?.total) || 0,
    count: Number(aggRows?.[0]?.cnt) || 0,
    userIds: (userRows || []).map((r) => r.userId).filter((id) => id != null)
  };
}

/**
 * Summary cards + per-type breakdown for the selected period.
 */
async function getBonusReportSummary({ userIds, startDate, endDate, timezoneOffset, type }) {
  const emptyBreakdown = BONUS_TX_TYPES.map((t) => ({
    type: t,
    label: BONUS_TYPE_LABELS[t] || t,
    hint: BONUS_TYPE_HINTS[t] || '',
    amount: 0,
    count: 0
  }));

  if (!userIds || userIds.length === 0) {
    return {
      totalBonusAmount: 0,
      totalBonusCount: 0,
      uniquePlayers: 0,
      byType: emptyBreakdown
    };
  }

  const { realTypes, includePackageExtra } = parseTypes(type);
  const { from, to } = resolveDateRange(startDate, endDate, timezoneOffset);
  if (!from || !to) {
    return {
      totalBonusAmount: 0,
      totalBonusCount: 0,
      uniquePlayers: 0,
      byType: emptyBreakdown
    };
  }

  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  let byTypeRows = [];
  let realUniqueUserIds = [];

  if (realTypes.length > 0) {
    if (isPg) {
      const [aggRows, uniqRows] = await Promise.all([
        db.sequelize.query(
          `SELECT type,
                  COALESCE(SUM(amount), 0)::float AS total,
                  COUNT(*)::int AS cnt
           FROM user_transactions
           WHERE user_id IN (:userIds)
             AND type IN (:types)
             AND created_at >= :from
             AND created_at <= :to
           GROUP BY type`,
          {
            replacements: { userIds, types: realTypes, from, to },
            type: db.Sequelize.QueryTypes.SELECT
          }
        ),
        db.sequelize.query(
          `SELECT DISTINCT user_id AS "userId"
           FROM user_transactions
           WHERE user_id IN (:userIds)
             AND type IN (:types)
             AND created_at >= :from
             AND created_at <= :to`,
          {
            replacements: { userIds, types: realTypes, from, to },
            type: db.Sequelize.QueryTypes.SELECT
          }
        )
      ]);
      byTypeRows = aggRows || [];
      realUniqueUserIds = (uniqRows || []).map((r) => r.userId).filter((id) => id != null);
    } else {
      const where = {
        userId: { [Op.in]: userIds },
        type: { [Op.in]: realTypes },
        createdAt: { [Op.gte]: from, [Op.lte]: to }
      };
      const rows = await db.UserTransaction.findAll({
        where,
        attributes: [
          'type',
          [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt']
        ],
        group: ['type'],
        raw: true
      });
      byTypeRows = (rows || []).map((r) => ({
        type: r.type,
        total: r.total,
        cnt: r.cnt
      }));
      const uniqRows = await db.UserTransaction.findAll({
        where,
        attributes: ['userId'],
        group: ['userId'],
        raw: true
      });
      realUniqueUserIds = (uniqRows || []).map((r) => r.userId).filter((id) => id != null);
    }
  }

  const byMap = {};
  for (const r of byTypeRows) {
    byMap[r.type] = {
      amount: Number(r.total) || 0,
      count: Number(r.cnt) || 0
    };
  }

  let packageExtra = { amount: 0, count: 0, userIds: [] };
  if (includePackageExtra && isPg) {
    packageExtra = await getPackageExtraSummary({ userIds, from, to });
    byMap[PACKAGE_EXTRA_TYPE] = {
      amount: packageExtra.amount,
      count: packageExtra.count
    };
  } else if (includePackageExtra && !isPg) {
    // Non-Postgres fallback: derive from deposit rows that already store pay_amount + credit_sc.
    const depositRows = await db.UserTransaction.findAll({
      where: {
        userId: { [Op.in]: userIds },
        type: 'deposit',
        createdAt: { [Op.gte]: from, [Op.lte]: to }
      },
      attributes: ['id', 'userId', 'amount', 'metadata'],
      raw: true
    });
    let amount = 0;
    let count = 0;
    const pkgUsers = new Set();
    for (const row of depositRows || []) {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const packageId = meta.package_id ?? meta.packageId;
      if (packageId == null) continue;
      const credit = Number(meta.credit_sc ?? meta.creditAmount ?? row.amount);
      const pay = Number(meta.pay_amount ?? meta.payAmount);
      if (!Number.isFinite(credit) || !Number.isFinite(pay)) continue;
      const extra = Math.max(0, credit - pay);
      if (extra <= 0) continue;
      amount += extra;
      count += 1;
      if (row.userId != null) pkgUsers.add(row.userId);
    }
    packageExtra = { amount, count, userIds: [...pkgUsers] };
    byMap[PACKAGE_EXTRA_TYPE] = { amount, count };
  }

  const selectedTypes = [
    ...realTypes,
    ...(includePackageExtra ? [PACKAGE_EXTRA_TYPE] : [])
  ];

  const byType = BONUS_TX_TYPES.map((t) => ({
    type: t,
    label: BONUS_TYPE_LABELS[t] || t,
    hint: BONUS_TYPE_HINTS[t] || '',
    amount: byMap[t]?.amount || 0,
    count: byMap[t]?.count || 0
  })).filter((row) => selectedTypes.includes(row.type));

  const totalBonusAmount = byType.reduce((s, r) => s + r.amount, 0);
  const totalBonusCount = byType.reduce((s, r) => s + r.count, 0);

  const uniqueSet = new Set([
    ...realUniqueUserIds,
    ...(includePackageExtra ? packageExtra.userIds : [])
  ]);

  return {
    totalBonusAmount,
    totalBonusCount,
    uniquePlayers: uniqueSet.size,
    byType
  };
}

function mapBonusRow(r) {
  const u = r.User || {};
  const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  const code =
    metadata.bonus_code ||
    metadata.bonusCode ||
    metadata.code ||
    null;
  return {
    id: r.id,
    userId: r.userId,
    username: displayName(u) || String(r.userId),
    email: u.email || null,
    type: r.type,
    typeLabel: BONUS_TYPE_LABELS[r.type] || r.type,
    typeHint: BONUS_TYPE_HINTS[r.type] || '',
    amount: Number(r.amount),
    currencyCode: r.currencyCode || 'SC',
    description: r.description || null,
    bonusCode: code,
    createdAt: r.createdAt || r.created_at,
    storeCode: u.storeCode || null,
    distributorCode: u.distributorCode || null
  };
}

/**
 * Paginated package-extra rows (report-only; amount = credit − pay).
 */
async function getPackageExtraTransactions({
  userIds,
  from,
  to,
  searchTerm,
  limit,
  offset
}) {
  const searchSql = searchTerm
    ? `AND (
         u.username ILIKE :search
         OR u.email ILIKE :search
         OR u.phone ILIKE :search
         OR u.first_name ILIKE :search
         OR u.last_name ILIKE :search
       )`
    : '';

  const replacements = { userIds, from, to, limit, offset };
  if (searchTerm) replacements.search = `%${searchTerm}%`;

  const [countRows, rows] = await Promise.all([
    db.sequelize.query(
      `SELECT COUNT(*)::int AS cnt
       FROM user_transactions ut
       INNER JOIN users u ON u.user_id = ut.user_id
       WHERE ut.user_id IN (:userIds)
         AND ut.type = 'deposit'
         AND ut.created_at >= :from
         AND ut.created_at <= :to
         AND ${packageDepositWhereSql('ut')}
         AND ${packageExtraSql('ut')} > 0
         ${searchSql}`,
      {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT
      }
    ),
    db.sequelize.query(
      `SELECT
          ut.id,
          ut.user_id AS "userId",
          '${PACKAGE_EXTRA_TYPE}' AS type,
          ${packageExtraSql('ut')} AS amount,
          ut.currency_code AS "currencyCode",
          ut.description,
          ut.metadata,
          ut.created_at AS "createdAt",
          u.username,
          u.email,
          u.first_name AS "firstName",
          u.last_name AS "lastName",
          u.phone,
          u.store_code AS "storeCode",
          u.distributor_code AS "distributorCode"
       FROM user_transactions ut
       INNER JOIN users u ON u.user_id = ut.user_id
       WHERE ut.user_id IN (:userIds)
         AND ut.type = 'deposit'
         AND ut.created_at >= :from
         AND ut.created_at <= :to
         AND ${packageDepositWhereSql('ut')}
         AND ${packageExtraSql('ut')} > 0
         ${searchSql}
       ORDER BY ut.created_at DESC, ut.id DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT
      }
    )
  ]);

  const total = Number(countRows?.[0]?.cnt) || 0;
  const rowsOut = (rows || []).map((r) => {
    const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const packageTitle = metadata.package_title || metadata.packageTitle || null;
    const extra = Number(r.amount) || 0;
    const detailParts = [];
    if (packageTitle) detailParts.push(packageTitle);
    if (extra > 0) detailParts.push(`+${extra} SC bonus`);
    return {
      id: `pkg-extra-${r.id}`,
      userId: r.userId,
      username: displayName(r) || String(r.userId),
      email: r.email || null,
      type: PACKAGE_EXTRA_TYPE,
      typeLabel: BONUS_TYPE_LABELS[PACKAGE_EXTRA_TYPE],
      typeHint: BONUS_TYPE_HINTS[PACKAGE_EXTRA_TYPE],
      amount: extra,
      currencyCode: r.currencyCode || 'SC',
      description: detailParts.length > 0
        ? `Package extra SC — ${detailParts.join(' · ')}`
        : (r.description || 'Package extra SC'),
      bonusCode: null,
      createdAt: r.createdAt,
      storeCode: r.storeCode || null,
      distributorCode: r.distributorCode || null
    };
  });

  return { rows: rowsOut, total };
}

/**
 * Paginated mixed list: real bonus txs UNION package-extra synthetic rows.
 */
async function getMixedBonusTransactionsPg({
  userIds,
  realTypes,
  includePackageExtra,
  from,
  to,
  searchTerm,
  limitNum,
  offset
}) {
  const parts = [];
  const replacements = { userIds, from, to, limit: limitNum, offset };

  if (realTypes.length > 0) {
    replacements.types = realTypes;
    const searchSql = searchTerm
      ? `AND (
           u.username ILIKE :search
           OR u.email ILIKE :search
           OR u.phone ILIKE :search
           OR u.first_name ILIKE :search
           OR u.last_name ILIKE :search
         )`
      : '';
    parts.push(`
      SELECT
        ut.id::text AS row_id,
        ut.id AS sort_id,
        ut.user_id,
        ut.type,
        ut.amount::numeric AS amount,
        ut.currency_code,
        ut.description,
        ut.metadata,
        ut.created_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.store_code,
        u.distributor_code
      FROM user_transactions ut
      INNER JOIN users u ON u.user_id = ut.user_id
      WHERE ut.user_id IN (:userIds)
        AND ut.type IN (:types)
        AND ut.created_at >= :from
        AND ut.created_at <= :to
        ${searchSql}
    `);
  }

  if (includePackageExtra) {
    const searchSql = searchTerm
      ? `AND (
           u.username ILIKE :search
           OR u.email ILIKE :search
           OR u.phone ILIKE :search
           OR u.first_name ILIKE :search
           OR u.last_name ILIKE :search
         )`
      : '';
    parts.push(`
      SELECT
        ('pkg-extra-' || ut.id::text) AS row_id,
        ut.id AS sort_id,
        ut.user_id,
        '${PACKAGE_EXTRA_TYPE}' AS type,
        ${packageExtraSql('ut')} AS amount,
        ut.currency_code,
        ut.description,
        ut.metadata,
        ut.created_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.store_code,
        u.distributor_code
      FROM user_transactions ut
      INNER JOIN users u ON u.user_id = ut.user_id
      WHERE ut.user_id IN (:userIds)
        AND ut.type = 'deposit'
        AND ut.created_at >= :from
        AND ut.created_at <= :to
        AND ${packageDepositWhereSql('ut')}
        AND ${packageExtraSql('ut')} > 0
        ${searchSql}
    `);
  }

  if (parts.length === 0) {
    return { rows: [], total: 0 };
  }

  if (searchTerm) replacements.search = `%${searchTerm}%`;

  const unionSql = parts.join('\nUNION ALL\n');

  const [countRows, rows] = await Promise.all([
    db.sequelize.query(
      `SELECT COUNT(*)::int AS cnt FROM (${unionSql}) AS merged`,
      {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT
      }
    ),
    db.sequelize.query(
      `SELECT * FROM (${unionSql}) AS merged
       ORDER BY merged.created_at DESC, merged.sort_id DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT
      }
    )
  ]);

  const total = Number(countRows?.[0]?.cnt) || 0;
  const rowsOut = (rows || []).map((r) => {
    const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const isPackageExtra = r.type === PACKAGE_EXTRA_TYPE;
    let description = r.description || null;
    if (isPackageExtra) {
      const packageTitle = metadata.package_title || metadata.packageTitle || null;
      const extra = Number(r.amount) || 0;
      const detailParts = [];
      if (packageTitle) detailParts.push(packageTitle);
      if (extra > 0) detailParts.push(`+${extra} SC bonus`);
      description = detailParts.length > 0
        ? `Package extra SC — ${detailParts.join(' · ')}`
        : (r.description || 'Package extra SC');
    }
    const code = isPackageExtra
      ? null
      : (metadata.bonus_code || metadata.bonusCode || metadata.code || null);
    const u = {
      username: r.username,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone
    };
    return {
      id: r.row_id,
      userId: r.user_id,
      username: displayName(u) || String(r.user_id),
      email: r.email || null,
      type: r.type,
      typeLabel: BONUS_TYPE_LABELS[r.type] || r.type,
      typeHint: BONUS_TYPE_HINTS[r.type] || '',
      amount: Number(r.amount) || 0,
      currencyCode: r.currency_code || 'SC',
      description,
      bonusCode: code,
      createdAt: r.created_at,
      storeCode: r.store_code || null,
      distributorCode: r.distributor_code || null
    };
  });

  return { rows: rowsOut, total };
}

/**
 * Paginated bonus transaction list.
 */
async function getBonusReportTransactions({
  userIds,
  startDate,
  endDate,
  timezoneOffset,
  type,
  search,
  page = 1,
  limit = DEFAULT_LIMIT
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const offset = (pageNum - 1) * limitNum;

  if (!userIds || userIds.length === 0) {
    return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
  }

  const { realTypes, includePackageExtra } = parseTypes(type);
  const { from, to } = resolveDateRange(startDate, endDate, timezoneOffset);
  if (!from || !to) {
    return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
  }

  const searchTerm = search != null ? String(search).trim() : '';
  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  // Package-extra-only filter
  if (includePackageExtra && realTypes.length === 0) {
    if (!isPg) {
      return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }
    const { rows, total } = await getPackageExtraTransactions({
      userIds,
      from,
      to,
      searchTerm,
      limit: limitNum,
      offset
    });
    return {
      rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 0
    };
  }

  // Mixed or real-only on Postgres: one UNION query keeps pagination correct
  if (isPg && (includePackageExtra || realTypes.length > 0)) {
    if (!includePackageExtra) {
      // Real types only — keep existing Sequelize path for simplicity
    } else {
      const { rows, total } = await getMixedBonusTransactionsPg({
        userIds,
        realTypes,
        includePackageExtra,
        from,
        to,
        searchTerm,
        limitNum,
        offset
      });
      return {
        rows,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 0
      };
    }
  }

  // Real bonus types only (any dialect)
  const where = {
    userId: { [Op.in]: userIds },
    type: { [Op.in]: realTypes },
    createdAt: { [Op.gte]: from, [Op.lte]: to }
  };

  const includeUser = {
    model: db.User,
    as: 'User',
    required: true,
    attributes: ['userId', 'username', 'email', 'firstName', 'lastName', 'phone', 'storeCode', 'distributorCode']
  };

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

  if (realTypes.length === 0) {
    return { rows: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
  }

  const { count, rows } = await db.UserTransaction.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset,
    attributes: ['id', 'userId', 'type', 'amount', 'currencyCode', 'description', 'metadata', 'createdAt'],
    include: [includeUser]
  });

  const rowsOut = (rows || []).map(mapBonusRow);
  const total = count != null ? count : 0;
  return {
    rows: rowsOut,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 0
  };
}

module.exports = {
  resolveUserIds,
  getBonusReportSummary,
  getBonusReportTransactions,
  PACKAGE_EXTRA_TYPE,
  REAL_BONUS_TX_TYPES,
  BONUS_TX_TYPES,
  BONUS_TYPE_LABELS,
  BONUS_TYPE_HINTS
};
