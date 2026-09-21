const db = require('../../db/models');
const { Op } = require('sequelize');

/**
 * Range summary for analytics: totalRecharge, totalWithdraw, totalTransactions, net.
 * Scope is applied via userIds passed from controller.
 * @param {object} params
 * @param {number[]} params.userIds - User IDs in scope
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @returns {Promise<{ totalRecharge, totalWithdraw, totalTransactions, net }>}
 */
async function getAnalyticsSummary({ userIds, startDate, endDate }) {
  const result = {
    totalRecharge: 0,
    totalWithdraw: 0,
    totalTransactions: 0,
    net: 0
  };
  if (!userIds || userIds.length === 0) return result;

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

  const [rechargeSum, withdrawSum, countResult] = await Promise.all([
    db.UserTransaction.sum('amount', { where: { ...baseWhere, type: 'deposit' } }),
    db.UserTransaction.sum('amount', { where: { ...baseWhere, type: 'withdraw' } }),
    db.UserTransaction.count({ where: baseWhere })
  ]);

  const totalRecharge = Number(rechargeSum) || 0;
  const totalWithdraw = Number(withdrawSum) || 0;
  const totalTransactions = countResult || 0;

  result.totalRecharge = totalRecharge;
  result.totalWithdraw = totalWithdraw;
  result.totalTransactions = totalTransactions;
  result.net = totalRecharge - totalWithdraw;
  return result;
}

module.exports = { getAnalyticsSummary };
