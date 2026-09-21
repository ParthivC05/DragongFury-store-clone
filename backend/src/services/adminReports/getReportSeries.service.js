const db = require('../../db/models');
const { Op } = require('sequelize');
const {
  toDateRangeStart,
  toDateRangeEnd,
  toDateTimeRangeStart,
  toDateTimeRangeEnd,
  parseTimezoneOffsetMin
} = require('../../utils/dateRangeFilters');

/**
 * Resolve created_at bounds. Date-only keeps existing UTC day behavior.
 * When startTime/endTime are provided with a valid timezoneOffset, use local datetime
 * (same as payment totals). Invalid/partial times fall back to date-only so filters
 * never silently drop the date range.
 */
function resolveCreatedAtBounds({ dateFrom, dateTo, startTime, endTime, timezoneOffset }) {
  const offset = parseTimezoneOffsetMin(timezoneOffset);
  const startTimeStr = startTime != null ? String(startTime).trim() : '';
  const endTimeStr = endTime != null ? String(endTime).trim() : '';
  const canUseLocalTimes = offset != null && (startTimeStr !== '' || endTimeStr !== '');

  let from = toDateRangeStart(dateFrom, offset);
  let to = toDateRangeEnd(dateTo, offset);

  if (canUseLocalTimes) {
    if (startTimeStr) {
      from = toDateTimeRangeStart(dateFrom, startTimeStr, offset) || from;
    }
    if (endTimeStr) {
      to = toDateTimeRangeEnd(dateTo, endTimeStr, offset) || to;
    }
  }

  return { from, to, tzMin: offset == null ? 0 : offset };
}

/**
 * Get time-series data for signups, topup (deposit), and withdraw: daily and monthly aggregates.
 * @param {object} params
 * @param {number[]} params.userIds - User IDs to include (for signups: users in scope; for tx: same scope)
 * @param {string} [params.dateFrom] - ISO date YYYY-MM-DD
 * @param {string} [params.dateTo] - ISO date YYYY-MM-DD
 * @param {string} [params.startTime] - HH:mm (optional; same as payment totals)
 * @param {string} [params.endTime] - HH:mm (optional; same as payment totals)
 * @param {number|string} [params.timezoneOffset] - Date.getTimezoneOffset() when using times
 * @returns {Promise<{ dailySignups, monthlySignups, dailyTopup, dailyWithdraw, monthlyTopup, monthlyWithdraw }>}
 */
async function getReportSeries({ userIds, dateFrom, dateTo, startTime, endTime, timezoneOffset }) {
  const empty = {
    dailySignups: [],
    monthlySignups: [],
    dailyTopup: [],
    dailyWithdraw: [],
    monthlyTopup: [],
    monthlyWithdraw: []
  };
  if (!userIds || userIds.length === 0) {
    return empty;
  }

  const { from, to, tzMin } = resolveCreatedAtBounds({ dateFrom, dateTo, startTime, endTime, timezoneOffset });
  // Invalid range (e.g. end before start) → empty series, not unbounded data
  if (from && to && from.getTime() > to.getTime()) {
    return empty;
  }

  const dateFilter = {};
  if (from) dateFilter[Op.gte] = from;
  if (to) dateFilter[Op.lte] = to;

  const baseWhere = { userId: { [Op.in]: userIds } };
  if (Object.keys(dateFilter).length > 0) baseWhere.createdAt = dateFilter;

  const topupWhere = { ...baseWhere, type: 'deposit' };
  const withdrawWhere = { ...baseWhere, type: 'withdraw' };

  // Use Sequelize group by date/month. PostgreSQL: date_trunc
  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  if (isPg) {
    const dateCond = [];
    const replacements = { userIds, tzMin: Number(tzMin) || 0 };
    const localDay = `date_trunc('day', "created_at" - (:tzMin * INTERVAL '1 minute'))`;
    const localMonth = `date_trunc('month', "created_at" - (:tzMin * INTERVAL '1 minute'))`;
    if (from) {
      dateCond.push('"created_at" >= :dateFrom');
      replacements.dateFrom = from;
    }
    if (to) {
      dateCond.push('"created_at" <= :dateTo');
      replacements.dateTo = to;
    }
    const dateClause = dateCond.length ? ' AND ' + dateCond.join(' AND ') : '';

    const [dailySignupsRows, monthlySignupsRows, dailyTopupRows, dailyWithdrawRows, monthlyTopupRows, monthlyWithdrawRows] = await Promise.all([
      db.sequelize.query(
        `SELECT ${localDay}::date AS "date", COUNT(*)::int AS count
         FROM users WHERE user_id IN (:userIds)${dateClause}
         GROUP BY 1 ORDER BY 1`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT to_char(${localMonth}, 'YYYY-MM') AS "month", COUNT(*)::int AS count
         FROM users WHERE user_id IN (:userIds)${dateClause}
         GROUP BY ${localMonth} ORDER BY 1`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT ${localDay}::date AS "date", COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS sum
         FROM user_transactions WHERE user_id IN (:userIds) AND type = 'deposit'${dateClause}
         GROUP BY 1 ORDER BY 1`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT ${localDay}::date AS "date", COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS sum
         FROM user_transactions WHERE user_id IN (:userIds) AND type = 'withdraw'${dateClause}
         GROUP BY 1 ORDER BY 1`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT to_char(${localMonth}, 'YYYY-MM') AS "month", COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS sum
         FROM user_transactions WHERE user_id IN (:userIds) AND type = 'deposit'${dateClause}
         GROUP BY ${localMonth} ORDER BY 1`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT to_char(${localMonth}, 'YYYY-MM') AS "month", COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS sum
         FROM user_transactions WHERE user_id IN (:userIds) AND type = 'withdraw'${dateClause}
         GROUP BY ${localMonth} ORDER BY 1`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      )
    ]);

    const formatDay = (d) => (d && d.toISOString) ? d.toISOString().slice(0, 10) : d;
    return {
      dailySignups: (dailySignupsRows || []).map((r) => ({ date: formatDay(r.date), count: r.count || 0 })),
      monthlySignups: (monthlySignupsRows || []).map((r) => ({ month: r.month, count: r.count || 0 })),
      dailyTopup: (dailyTopupRows || []).map((r) => ({ date: formatDay(r.date), count: r.count || 0, sum: Number(r.sum) || 0 })),
      dailyWithdraw: (dailyWithdrawRows || []).map((r) => ({ date: formatDay(r.date), count: r.count || 0, sum: Number(r.sum) || 0 })),
      monthlyTopup: (monthlyTopupRows || []).map((r) => ({ month: r.month, count: r.count || 0, sum: Number(r.sum) || 0 })),
      monthlyWithdraw: (monthlyWithdrawRows || []).map((r) => ({ month: r.month, count: r.count || 0, sum: Number(r.sum) || 0 }))
    };
  }

  // Fallback for non-PostgreSQL: fetch and group in JS
  const userWhere = { userId: { [Op.in]: userIds } };
  if (Object.keys(dateFilter).length > 0) userWhere.createdAt = dateFilter;
  const [userRows, topupRows, withdrawRows] = await Promise.all([
    db.User.findAll({
      where: userWhere,
      attributes: ['createdAt'],
      raw: true
    }),
    db.UserTransaction.findAll({
      where: topupWhere,
      attributes: ['createdAt', 'amount'],
      raw: true
    }),
    db.UserTransaction.findAll({
      where: withdrawWhere,
      attributes: ['createdAt', 'amount'],
      raw: true
    })
  ]);

  const localStamp = (d, len) => {
    if (!d) return '';
    return new Date(d.getTime() - (Number(tzMin) || 0) * 60 * 1000).toISOString().slice(0, len);
  };

  const daily = (rows, key, hasSum = true) => {
    const map = {};
    (rows || []).forEach((r) => {
      const d = (r.createdAt || r.created_at) ? new Date(r.createdAt || r.created_at) : null;
      const dateStr = localStamp(d, 10);
      if (dateStr) {
        if (!map[dateStr]) map[dateStr] = { count: 0, sum: 0 };
        map[dateStr].count += 1;
        if (hasSum && r.amount != null) map[dateStr].sum += Number(r.amount) || 0;
      }
    });
    return Object.entries(map)
      .map(([date, v]) => (hasSum ? { [key]: date, count: v.count, sum: v.sum } : { [key]: date, count: v.count }))
      .sort((a, b) => (a[key] || '').localeCompare(b[key] || ''));
  };

  const monthly = (rows, key, hasSum = true) => {
    const map = {};
    (rows || []).forEach((r) => {
      const d = (r.createdAt || r.created_at) ? new Date(r.createdAt || r.created_at) : null;
      const monthStr = localStamp(d, 7);
      if (monthStr) {
        if (!map[monthStr]) map[monthStr] = { count: 0, sum: 0 };
        map[monthStr].count += 1;
        if (hasSum && r.amount != null) map[monthStr].sum += Number(r.amount) || 0;
      }
    });
    return Object.entries(map)
      .map(([month, v]) => (hasSum ? { [key]: month, count: v.count, sum: v.sum } : { [key]: month, count: v.count }))
      .sort((a, b) => (a[key] || '').localeCompare(b[key] || ''));
  };

  return {
    dailySignups: daily(userRows || [], 'date', false),
    monthlySignups: monthly(userRows || [], 'month', false),
    dailyTopup: daily(topupRows || [], 'date'),
    dailyWithdraw: daily(withdrawRows || [], 'date'),
    monthlyTopup: monthly(topupRows || [], 'month'),
    monthlyWithdraw: monthly(withdrawRows || [], 'month')
  };
}

module.exports = { getReportSeries };
