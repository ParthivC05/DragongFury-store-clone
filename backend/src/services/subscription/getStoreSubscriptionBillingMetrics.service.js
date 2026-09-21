'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { ROLES } = require('../../constants/roles');

/**
 * Get Game BOT deposit and net profit for a store (for subscription percentage billing).
 * Uses user_transactions with type 'game_deposit' and 'game_withdraw' for users in the store.
 * @param {object} params
 * @param {string} params.distributorCode
 * @param {string} params.storeCode
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @returns {Promise<{ gameBotDeposit, gameBotWithdraw, gameBotNetProfit, userIds }>}
 */
async function getStoreSubscriptionBillingMetrics({ distributorCode, storeCode, startDate, endDate }) {
  const result = {
    gameBotDeposit: 0,
    gameBotWithdraw: 0,
    gameBotNetProfit: 0,
    userIds: []
  };

  if (!distributorCode || !storeCode) return result;

  const users = await db.User.findAll({
    where: {
      distributorCode,
      storeCode,
      role: ROLES.USER
    },
    attributes: ['userId'],
    raw: true
  });
  const userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
  result.userIds = userIds;

  if (userIds.length === 0) return result;

  const dateFilter = {};
  if (startDate) {
    const from = new Date(startDate);
    if (!isNaN(from.getTime())) dateFilter[Op.gte] = from;
  }
  if (endDate) {
    const to = new Date(endDate);
    to.setHours(23, 59, 59, 999);
    if (!isNaN(to.getTime())) dateFilter[Op.lte] = to;
  }

  const baseWhere = { userId: { [Op.in]: userIds } };
  if (Object.keys(dateFilter).length > 0) baseWhere.created_at = dateFilter;

  const [depositSum, withdrawSum] = await Promise.all([
    db.UserTransaction.sum('amount', { where: { ...baseWhere, type: 'game_deposit' } }),
    db.UserTransaction.sum('amount', { where: { ...baseWhere, type: 'game_withdraw' } })
  ]);

  const gameBotDeposit = Number(depositSum) || 0;
  const gameBotWithdraw = Number(withdrawSum) || 0;
  result.gameBotDeposit = gameBotDeposit;
  result.gameBotWithdraw = gameBotWithdraw;
  result.gameBotNetProfit = gameBotDeposit - gameBotWithdraw;
  return result;
}

/**
 * Calculate subscription amount for a percentage-based plan.
 * @param {object} plan - Subscription with billingType, percentageValue, percentageBase
 * @param {number} gameBotDeposit
 * @param {number} gameBotNetProfit
 * @returns {number} calculated amount (can be negative if net profit is negative)
 */
function calculatePercentageAmount(plan, gameBotDeposit, gameBotNetProfit) {
  if (!plan || plan.billingType !== 'percentage') return 0;
  const pct = Number(plan.percentageValue) || 0;
  const base = plan.percentageBase === 'game_bot_net_profit' ? gameBotNetProfit : gameBotDeposit;
  return (Number(base) || 0) * (pct / 100);
}

module.exports = {
  getStoreSubscriptionBillingMetrics,
  calculatePercentageAmount
};
