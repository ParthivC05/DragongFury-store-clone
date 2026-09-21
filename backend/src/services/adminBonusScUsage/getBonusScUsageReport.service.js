'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { REAL_BONUS_TX_TYPES } = require('../adminBonusReport/bonusReport.constants');
const { ROLES } = require('../../constants/roles');

const GIVEN_TX_TYPES = [...REAL_BONUS_TX_TYPES, 'admin_add', 'deposit_courtesy'];
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function resolveDateRange(startDate, endDate) {
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
    from: toDateRangeStart(rangeStart),
    to: toDateRangeEnd(rangeEnd)
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function parsePageLimit(page, limit) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  let l = parseInt(limit, 10) || DEFAULT_LIMIT;
  if (!Number.isFinite(l) || l < 1) l = DEFAULT_LIMIT;
  if (l > MAX_LIMIT) l = MAX_LIMIT;
  return { page: p, limit: l, offset: (p - 1) * l };
}

/**
 * @returns {{ sql: string, bind: object }}
 */
function storeFilterSql(filterStoreCode, alias = 'u') {
  if (!filterStoreCode) return { sql: '', bind: {} };
  return {
    sql: ` AND ${alias}.store_code = :storeCode`,
    bind: { storeCode: String(filterStoreCode).trim() }
  };
}

function displayName(row) {
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return full || null;
}

/**
 * Unused Bonus SC per player (current BSC balance).
 */
async function queryUnusedByUser(filterStoreCode) {
  const store = storeFilterSql(filterStoreCode);
  const rows = await db.sequelize.query(
    `
    SELECT
      u.user_id AS "userId",
      u.username AS "username",
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.email AS "email",
      u.phone AS "phone",
      COALESCE(NULLIF(TRIM(u.store_code), ''), '—') AS "storeCode",
      COALESCE(SUM(w.balance), 0)::float AS unused
    FROM wallets w
    INNER JOIN users u ON u.user_id = w.user_id
    WHERE w.currency_code = :bsc
      AND u.role = :userRole
      ${store.sql}
    GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.email, u.phone, u.store_code
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { bsc: BONUS_CURRENCY_CODE, userRole: ROLES.USER, ...store.bind }
    }
  );
  return rows || [];
}

/**
 * Bonus SC given in period per player.
 */
async function queryGivenByUser({ from, to, filterStoreCode }) {
  const store = storeFilterSql(filterStoreCode);
  const rows = await db.sequelize.query(
    `
    SELECT
      u.user_id AS "userId",
      u.username AS "username",
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.email AS "email",
      u.phone AS "phone",
      COALESCE(NULLIF(TRIM(u.store_code), ''), '—') AS "storeCode",
      COALESCE(SUM(ut.amount), 0)::float AS given
    FROM user_transactions ut
    INNER JOIN users u ON u.user_id = ut.user_id
    WHERE ut.currency_code = :bsc
      AND ut.type IN (:givenTypes)
      AND ut.created_at >= :from
      AND ut.created_at <= :to
      AND u.role = :userRole
      ${store.sql}
    GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.email, u.phone, u.store_code
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        bsc: BONUS_CURRENCY_CODE,
        givenTypes: GIVEN_TX_TYPES,
        from,
        to,
        userRole: ROLES.USER,
        ...store.bind
      }
    }
  );
  return rows || [];
}

/**
 * Bonus SC used in period per player.
 */
async function queryUsedByUser({ from, to, filterStoreCode }) {
  const store = storeFilterSql(filterStoreCode);
  const rows = await db.sequelize.query(
    `
    SELECT
      u.user_id AS "userId",
      u.username AS "username",
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.email AS "email",
      u.phone AS "phone",
      COALESCE(NULLIF(TRIM(u.store_code), ''), '—') AS "storeCode",
      COALESCE(SUM(spend.used_amount), 0)::float AS used
    FROM (
      SELECT
        ut.user_id,
        COALESCE(NULLIF(ut.metadata->'funding'->>'bsc', '')::numeric, 0) AS used_amount
      FROM user_transactions ut
      WHERE ut.type = 'game_deposit'
        AND ut.created_at >= :from
        AND ut.created_at <= :to
        AND COALESCE(NULLIF(ut.metadata->'funding'->>'bsc', '')::numeric, 0) > 0

      UNION ALL

      SELECT
        ut.user_id,
        ut.amount::numeric AS used_amount
      FROM user_transactions ut
      WHERE ut.currency_code = :bsc
        AND ut.created_at >= :from
        AND ut.created_at <= :to
        AND COALESCE(NULLIF(ut.metadata->'walletImpact'->>'bsc', '')::numeric, 0) < 0

      UNION ALL

      SELECT
        ut.user_id,
        ut.amount::numeric AS used_amount
      FROM user_transactions ut
      WHERE ut.type = 'admin_deduct'
        AND ut.currency_code = :bsc
        AND ut.created_at >= :from
        AND ut.created_at <= :to
    ) spend
    INNER JOIN users u ON u.user_id = spend.user_id
    WHERE u.role = :userRole
      ${store.sql}
    GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.email, u.phone, u.store_code
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        bsc: BONUS_CURRENCY_CODE,
        from,
        to,
        userRole: ROLES.USER,
        ...store.bind
      }
    }
  );
  return rows || [];
}

function mergeUserRows(unusedRows, usedRows, givenRows) {
  const map = new Map();

  function ensure(r) {
    const id = Number(r.userId);
    if (!map.has(id)) {
      map.set(id, {
        userId: id,
        username: r.username || null,
        firstName: r.firstName || null,
        lastName: r.lastName || null,
        name: displayName(r),
        email: r.email || null,
        phone: r.phone || null,
        storeCode: r.storeCode || '—',
        unused: 0,
        used: 0,
        given: 0
      });
    } else {
      const existing = map.get(id);
      if (!existing.username && r.username) existing.username = r.username;
      if (!existing.firstName && r.firstName) existing.firstName = r.firstName;
      if (!existing.lastName && r.lastName) existing.lastName = r.lastName;
      if (!existing.name) existing.name = displayName(r);
      if (!existing.email && r.email) existing.email = r.email;
      if (!existing.phone && r.phone) existing.phone = r.phone;
      if ((!existing.storeCode || existing.storeCode === '—') && r.storeCode) {
        existing.storeCode = r.storeCode;
      }
    }
    return map.get(id);
  }

  for (const r of unusedRows) {
    const row = ensure(r);
    row.unused = round2(r.unused);
  }
  for (const r of usedRows) {
    const row = ensure(r);
    row.used = round2(r.used);
  }
  for (const r of givenRows) {
    const row = ensure(r);
    row.given = round2(r.given);
  }

  const all = [...map.values()].filter((r) => r.unused > 0 || r.used > 0 || r.given > 0);

  all.sort((a, b) => {
    if (b.unused !== a.unused) return b.unused - a.unused;
    if (b.used !== a.used) return b.used - a.used;
    return String(a.username || a.name || a.userId).localeCompare(
      String(b.username || b.name || b.userId)
    );
  });

  const totals = all.reduce(
    (acc, r) => {
      acc.unused += r.unused;
      acc.used += r.used;
      acc.given += r.given;
      return acc;
    },
    { unused: 0, used: 0, given: 0 }
  );

  return {
    all,
    totals: {
      unused: round2(totals.unused),
      used: round2(totals.used),
      given: round2(totals.given)
    }
  };
}

function buildStoreRows(userRows) {
  const map = new Map();
  for (const r of userRows) {
    const code = r.storeCode || '—';
    if (!map.has(code)) {
      map.set(code, { storeCode: code, unused: 0, used: 0, given: 0, players: 0 });
    }
    const row = map.get(code);
    row.unused = round2(row.unused + r.unused);
    row.used = round2(row.used + r.used);
    row.given = round2(row.given + r.given);
    row.players += 1;
  }
  return [...map.values()].sort((a, b) => String(a.storeCode).localeCompare(String(b.storeCode)));
}

/**
 * Summary + per-store + per-player breakdown for Bonus SC used vs unused.
 */
async function getBonusScUsageReport({ startDate, endDate, filterStoreCode, page, limit } = {}) {
  const { rangeStart, rangeEnd, from, to } = resolveDateRange(startDate, endDate);
  const store = filterStoreCode ? String(filterStoreCode).trim() : undefined;
  const paging = parsePageLimit(page, limit);

  const [unusedRows, usedRows, givenRows] = await Promise.all([
    queryUnusedByUser(store),
    queryUsedByUser({ from, to, filterStoreCode: store }),
    queryGivenByUser({ from, to, filterStoreCode: store })
  ]);

  const { all, totals } = mergeUserRows(unusedRows, usedRows, givenRows);
  const storeRows = buildStoreRows(all);
  const total = all.length;
  const rows = all.slice(paging.offset, paging.offset + paging.limit);

  return {
    startDate: rangeStart,
    endDate: rangeEnd,
    totals,
    storeRows,
    rows,
    total,
    page: paging.page,
    limit: paging.limit,
    labels: {
      unused: 'Still left',
      used: 'Already used',
      given: 'Given'
    },
    hints: {
      unused: 'Bonus SC players still have in their wallet right now (not used yet).',
      used: 'Bonus SC spent in games or taken away by admin in this date range.',
      given: 'Bonus SC we gave to players in this date range (welcome, daily, codes, etc.).'
    }
  };
}

async function getBonusScUsageFilterOptions() {
  const storeRows = await db.User.findAll({
    where: { role: ROLES.STORE_ADMIN },
    attributes: ['storeCode'],
    raw: true
  });
  const storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();
  return { storeCodes };
}

module.exports = {
  getBonusScUsageReport,
  getBonusScUsageFilterOptions,
  GIVEN_TX_TYPES
};
