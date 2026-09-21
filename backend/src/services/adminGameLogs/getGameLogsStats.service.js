'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { withCustomManualGamesExcluded } = require('./excludeCustomManualGames.helper');

/**
 * Build where clause for game_activities filtered by user scope and optional date range.
 * Uses UTC timestamps to avoid timezone-dependent createdAt filter errors.
 */
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

/**
 * Build user where for scope (store / distributor).
 */
function buildUserWhere(scope) {
  if (!scope || (typeof scope.storeCode !== 'string' && typeof scope.distributorCode !== 'string')) {
    return {};
  }
  const userWhere = {};
  if (scope.storeCode) userWhere.storeCode = scope.storeCode;
  if (scope.distributorCode) userWhere.distributorCode = scope.distributorCode;
  return userWhere;
}

async function getGameLogsStats({ scope = {}, startDate = null, endDate = null } = {}) {
  const userWhere = buildUserWhere(scope);
  const activityWhere = await withCustomManualGamesExcluded(buildWhere(scope, startDate, endDate));

  const includeUser = Object.keys(userWhere).length > 0
    ? [{ model: db.User, as: 'User', attributes: [], where: userWhere, required: true }]
    : [{ model: db.User, as: 'User', attributes: [] }];

  const baseOptions = {
    where: activityWhere,
    include: includeUser,
    raw: true
  };

  // Auto vs Manual ratio is based on ALL game operations in the date range:
  // - Signups (register), Deposits (topup), Withdrawals (withdraw + redeem).
  // Each activity has operation_done_by: 'bot' / null = Auto, else = Manual.
  // Custom manual games are excluded so they do not skew the ratio.
  const allActivities = await db.GameActivity.findAll({
    ...baseOptions,
    attributes: ['activityType', 'amount', 'operationDoneBy']
  });

  let autoCount = 0;
  let manualCount = 0;
  let depositAmount = 0;
  let depositCount = 0;
  let withdrawAmount = 0;
  let withdrawCount = 0;

  for (const row of allActivities) {
    const type = row.activityType || row.activity_type;
    const amount = Number(row.amount) || 0;
    const doneBy = row.operationDoneBy || row.operation_done_by;

    if (doneBy === 'bot' || !doneBy) {
      autoCount += 1;
    } else {
      manualCount += 1;
    }

    if (type === 'topup') {
      depositAmount += amount;
      depositCount += 1;
    } else if (type === 'withdraw' || type === 'redeem') {
      withdrawAmount += amount;
      withdrawCount += 1;
    }
  }

  const totalOps = autoCount + manualCount;
  const autoPercent = totalOps > 0 ? Math.round((autoCount / totalOps) * 100) : 0;
  const manualPercent = totalOps > 0 ? Math.round((manualCount / totalOps) * 100) : 0;

  return {
    autoManualRatio: { autoPercent, manualPercent },
    depositStats: {
      amount: depositAmount,
      transactionCount: depositCount,
      successCount: depositCount,
      failedCount: 0
    },
    withdrawStats: {
      amount: withdrawAmount,
      transactionCount: withdrawCount,
      successCount: withdrawCount,
      failedCount: 0
    }
  };
}

module.exports = { getGameLogsStats };
