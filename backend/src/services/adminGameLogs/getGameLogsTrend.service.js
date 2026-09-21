'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const {
  withCustomManualGamesExcluded,
  getCustomManualGamesSqlExclusion
} = require('./excludeCustomManualGames.helper');

function buildWhere(scope, startDate, endDate) {
  const where = {};
  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }
  return where;
}

function buildUserWhere(scope) {
  if (!scope || (typeof scope.storeCode !== 'string' && typeof scope.distributorCode !== 'string')) {
    return {};
  }
  const userWhere = {};
  if (scope.storeCode) userWhere.storeCode = scope.storeCode;
  if (scope.distributorCode) userWhere.distributorCode = scope.distributorCode;
  return userWhere;
}

/**
 * Daily trend of game deposit (topup) and withdraw (withdraw + redeem) amounts for charts.
 * @param {object} params
 * @param {object} [params.scope] - { storeCode?, distributorCode? }
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @returns {Promise<Array<{ date: string, depositAmount: number, withdrawAmount: number }>>}
 */
async function getGameLogsTrend({ scope = {}, startDate = null, endDate = null } = {}) {
  const userWhere = buildUserWhere(scope);
  const activityWhere = await withCustomManualGamesExcluded({
    ...buildWhere(scope, startDate, endDate),
    activityType: { [Op.in]: ['topup', 'withdraw', 'redeem'] }
  });

  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  if (isPg) {
    const customExclusion = await getCustomManualGamesSqlExclusion('ga');
    const replacements = {
      startDate: toDateRangeStart(startDate),
      endDate: toDateRangeEnd(endDate),
      ...customExclusion.replacements
    };
    const scopeConditions = [];
    if (userWhere.storeCode) {
      scopeConditions.push('u.store_code = :storeCode');
      replacements.storeCode = userWhere.storeCode;
    }
    if (userWhere.distributorCode) {
      scopeConditions.push('u.distributor_code = :distributorCode');
      replacements.distributorCode = userWhere.distributorCode;
    }
    const scopeClause = scopeConditions.length ? ' AND ' + scopeConditions.join(' AND ') : '';
    const hasDateRange = startDate && endDate;
    const dateClause = hasDateRange
      ? ' AND ga.created_at >= :startDate AND ga.created_at <= :endDate'
      : '';

    const sql = `
      SELECT date_trunc('day', ga.created_at)::date AS date,
        COALESCE(SUM(CASE WHEN ga.activity_type = 'topup' THEN ga.amount ELSE 0 END), 0)::float AS deposit_amount,
        COALESCE(SUM(CASE WHEN ga.activity_type IN ('withdraw','redeem') THEN ga.amount ELSE 0 END), 0)::float AS withdraw_amount
      FROM game_activities ga
      INNER JOIN users u ON u.user_id = ga.user_id
      WHERE ga.activity_type IN ('topup','withdraw','redeem')
        ${dateClause}
        ${scopeClause}
        ${customExclusion.clause}
      GROUP BY date_trunc('day', ga.created_at)
      ORDER BY 1
    `;
    const rows = await db.sequelize.query(sql.trim(), {
      replacements: Object.keys(replacements).reduce((acc, k) => {
        if (replacements[k] != null) acc[k] = replacements[k];
        return acc;
      }, {}),
      type: db.Sequelize.QueryTypes.SELECT
    });
    const formatDay = (d) => (d && d.toISOString) ? d.toISOString().slice(0, 10) : d;
    return (rows || []).map((r) => ({
      date: formatDay(r.date),
      depositAmount: Number(r.deposit_amount) || 0,
      withdrawAmount: Number(r.withdraw_amount) || 0
    }));
  }

  const includeUser = Object.keys(userWhere).length > 0
    ? [{ model: db.User, as: 'User', attributes: [], where: userWhere, required: true }]
    : [{ model: db.User, as: 'User', attributes: [] }];

  const rows = await db.GameActivity.findAll({
    where: activityWhere,
    include: includeUser,
    attributes: ['activityType', 'amount', 'createdAt'],
    raw: true
  });

  const byDate = {};
  for (const row of rows || []) {
    const d = row.createdAt ? new Date(row.createdAt) : null;
    const dateStr = d ? d.toISOString().slice(0, 10) : '';
    if (!dateStr) continue;
    if (!byDate[dateStr]) byDate[dateStr] = { depositAmount: 0, withdrawAmount: 0 };
    const type = row.activityType || row.activity_type;
    const amount = Number(row.amount) || 0;
    if (type === 'topup') byDate[dateStr].depositAmount += amount;
    else if (type === 'withdraw' || type === 'redeem') byDate[dateStr].withdrawAmount += amount;
  }
  return Object.entries(byDate)
    .map(([date, v]) => ({ date, depositAmount: v.depositAmount, withdrawAmount: v.withdrawAmount }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

module.exports = { getGameLogsTrend };
