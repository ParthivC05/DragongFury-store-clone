const db = require('../../db/models');
const { Op } = require('sequelize');
const { REPORTS_REAL_MONEY_ONLY } = require('./reportsConfig');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');

const REAL_MONEY_TYPES = ['deposit', 'withdraw'];

/**
 * Unified report summary: rechargeAmount, withdrawAmount, transactionCount, net.
 * Scope is applied via userIds from controller.
 * Uses raw SQL (same pattern as getReportSeries) so totals match trend chart and transaction list.
 */
function emptySummary() {
  return {
    rechargeAmount: 0,
    withdrawAmount: 0,
    depositCount: 0,
    withdrawCount: 0,
    transactionCount: 0,
    chimeWithdrawAmount: 0,
    cashappWithdrawAmount: 0,
    otherWithdrawAmount: 0,
    net: 0
  };
}

function withOtherWithdrawals(summary) {
  const otherWithdrawAmount = Math.max(
    0,
    Math.round((Number(summary.withdrawAmount) - Number(summary.chimeWithdrawAmount) - Number(summary.cashappWithdrawAmount)) * 100) / 100
  );
  return { ...summary, otherWithdrawAmount };
}

async function getReportsSummary({ userIds, startDate, endDate, type, timezoneOffset }) {
  const result = emptySummary();
  if (!userIds || userIds.length === 0) return result;

  const realMoneyOnly = REPORTS_REAL_MONEY_ONLY;
  const startStr = startDate && String(startDate).trim();
  const endStr = endDate && String(endDate).trim();
  if (!startStr || !endStr) return result;

  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  if (isPg) {
    const dateFrom = toDateRangeStart(startStr, timezoneOffset);
    const dateTo = toDateRangeEnd(endStr, timezoneOffset);
    if (!dateFrom || !dateTo) return result;
    const replacements = { userIds, dateFrom, dateTo };
    const dateClause = ' AND "created_at" >= :dateFrom AND "created_at" <= :dateTo';
    const typeClause = realMoneyOnly ? " AND type IN ('deposit', 'withdraw')" : '';

    const [rechargeRows, withdrawRows, countRows, chimeRows, cashappRows] = await Promise.all([
      db.sequelize.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS cnt FROM user_transactions WHERE user_id IN (:userIds) AND type = 'deposit'${dateClause}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS cnt FROM user_transactions WHERE user_id IN (:userIds) AND type = 'withdraw'${dateClause}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT COUNT(*)::int AS cnt FROM user_transactions WHERE user_id IN (:userIds)${dateClause}${typeClause}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total FROM chime_cashapp_withdrawal_requests WHERE user_id IN (:userIds) AND status = 'completed' AND payout_type = 'chime'${dateClause.replace(/"created_at"/g, 'updated_at')}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total FROM chime_cashapp_withdrawal_requests WHERE user_id IN (:userIds) AND status = 'completed' AND payout_type = 'cashapp'${dateClause.replace(/"created_at"/g, 'updated_at')}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      )
    ]);

    const rechargeAmount = Number(rechargeRows?.[0]?.total) || 0;
    const withdrawAmount = Number(withdrawRows?.[0]?.total) || 0;
    const depositCount = Number(rechargeRows?.[0]?.cnt) || 0;
    const withdrawCount = Number(withdrawRows?.[0]?.cnt) || 0;
    const transactionCount = Number(countRows?.[0]?.cnt) || 0;
    const chimeWithdrawAmount = Number(chimeRows?.[0]?.total) || 0;
    const cashappWithdrawAmount = Number(cashappRows?.[0]?.total) || 0;

    return withOtherWithdrawals({
      rechargeAmount,
      withdrawAmount,
      depositCount,
      withdrawCount,
      transactionCount,
      chimeWithdrawAmount,
      cashappWithdrawAmount,
      net: rechargeAmount - withdrawAmount
    });
  }

  // Non-PostgreSQL: use Sequelize with explicit date range
  const from = toDateRangeStart(startStr, timezoneOffset);
  const to = toDateRangeEnd(endStr, timezoneOffset);
  if (!from || !to) return result;

  const baseWhere = {
    userId: { [Op.in]: userIds },
    createdAt: { [Op.gte]: from, [Op.lte]: to }
  };
  const depositWhere = { ...baseWhere, type: 'deposit' };
  const withdrawWhere = { ...baseWhere, type: 'withdraw' };
  let countWhere = baseWhere;
  if (realMoneyOnly) countWhere = { ...baseWhere, type: { [Op.in]: REAL_MONEY_TYPES } };
  if (type && ['deposit', 'withdraw'].includes(type)) countWhere = { ...baseWhere, type };

  const [rechargeSum, withdrawSum, depositCount, withdrawCount, countResult, chimeSum, cashappSum] = await Promise.all([
    db.UserTransaction.sum('amount', { where: depositWhere }),
    db.UserTransaction.sum('amount', { where: withdrawWhere }),
    db.UserTransaction.count({ where: depositWhere }),
    db.UserTransaction.count({ where: withdrawWhere }),
    db.UserTransaction.count({ where: countWhere }),
    db.ChimeCashappWithdrawalRequest.sum('amount', { where: { userId: { [Op.in]: userIds }, status: 'completed', payoutType: 'chime', updatedAt: { [Op.gte]: from, [Op.lte]: to } } }),
    db.ChimeCashappWithdrawalRequest.sum('amount', { where: { userId: { [Op.in]: userIds }, status: 'completed', payoutType: 'cashapp', updatedAt: { [Op.gte]: from, [Op.lte]: to } } })
  ]);

  const rechargeAmount = Number(rechargeSum) || 0;
  const withdrawAmount = Number(withdrawSum) || 0;

  return withOtherWithdrawals({
    rechargeAmount,
    withdrawAmount,
    depositCount: Number(depositCount) || 0,
    withdrawCount: Number(withdrawCount) || 0,
    transactionCount: Number(countResult) || 0,
    chimeWithdrawAmount: Number(chimeSum) || 0,
    cashappWithdrawAmount: Number(cashappSum) || 0,
    net: rechargeAmount - withdrawAmount
  });
}

module.exports = { getReportsSummary };
