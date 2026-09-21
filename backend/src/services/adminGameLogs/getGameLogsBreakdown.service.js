'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { withCustomManualGamesExcluded } = require('./excludeCustomManualGames.helper');

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
 * Count game log operations by type for bar chart: Signup, Deposit, Withdraw.
 * @param {object} params
 * @param {object} [params.scope] - { storeCode?, distributorCode? }
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @returns {Promise<Array<{ type: string, count: number }>>}
 */
async function getGameLogsBreakdown({ scope = {}, startDate = null, endDate = null } = {}) {
  const userWhere = buildUserWhere(scope);
  const activityWhere = await withCustomManualGamesExcluded(buildWhere(scope, startDate, endDate));

  const includeUser = Object.keys(userWhere).length > 0
    ? [{ model: db.User, as: 'User', attributes: [], where: userWhere, required: true }]
    : [{ model: db.User, as: 'User', attributes: [] }];

  const rows = await db.GameActivity.findAll({
    where: activityWhere,
    include: includeUser,
    attributes: ['activityType'],
    raw: true
  });

  let signupCount = 0;
  let depositCount = 0;
  let withdrawCount = 0;
  for (const row of rows || []) {
    const type = row.activityType || row.activity_type;
    if (type === 'register') signupCount += 1;
    else if (type === 'topup') depositCount += 1;
    else if (type === 'withdraw' || type === 'redeem') withdrawCount += 1;
  }

  return [
    { type: 'Signup', count: signupCount },
    { type: 'Deposit', count: depositCount },
    { type: 'Withdraw', count: withdrawCount }
  ];
}

module.exports = { getGameLogsBreakdown };
