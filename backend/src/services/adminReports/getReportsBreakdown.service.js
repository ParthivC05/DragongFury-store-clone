const db = require('../../db/models');
const { Op } = require('sequelize');
const { REPORTS_REAL_MONEY_ONLY } = require('./reportsConfig');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');

const TYPE_LABELS = {
  deposit: 'Recharge',
  withdraw: 'Withdraw',
  spin_wheel: 'Redeem',
  promotion: 'Bonus',
  affiliate: 'Bonus',
  vip_bonus: 'Bonus',
  game_deposit: 'Game',
  game_withdraw: 'Game'
};

/**
 * Count transactions by type for bar chart. Returns [{ type: label, count }].
 * When REPORTS_REAL_MONEY_ONLY is true (reportsConfig.js), only Recharge and Withdraw are returned.
 * @param {object} params
 * @param {number[]} params.userIds
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 */
async function getReportsBreakdown({ userIds, startDate, endDate, timezoneOffset }) {
  const realMoneyOnly = REPORTS_REAL_MONEY_ONLY;
  const emptyResult = realMoneyOnly
    ? [
        { type: 'Recharge', count: 0 },
        { type: 'Withdraw', count: 0 },
        { type: 'Chime', count: 0 },
        { type: 'CashApp', count: 0 }
      ]
    : [
        { type: 'Recharge', count: 0 },
        { type: 'Withdraw', count: 0 },
        { type: 'Chime', count: 0 },
        { type: 'CashApp', count: 0 },
        { type: 'Bonus', count: 0 }
      ];

  if (!userIds || userIds.length === 0) {
    return emptyResult;
  }

  const dateFilter = {};
  const from = toDateRangeStart(startDate, timezoneOffset);
  const to = toDateRangeEnd(endDate, timezoneOffset);
  if (from) dateFilter[Op.gte] = from;
  if (to) dateFilter[Op.lte] = to;

  const baseWhere = { userId: { [Op.in]: userIds } };
  if (Object.keys(dateFilter).length > 0) baseWhere.created_at = dateFilter;

  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  if (isPg) {
    const replacements = { userIds };
    const dateCond = [];
    const from = toDateRangeStart(startDate, timezoneOffset);
    const to = toDateRangeEnd(endDate, timezoneOffset);
    if (from) {
      dateCond.push('"created_at" >= :startDate');
      replacements.startDate = from;
    }
    if (to) {
      dateCond.push('"created_at" <= :endDate');
      replacements.endDate = to;
    }
    const dateClause = dateCond.length ? ' AND ' + dateCond.join(' AND ') : '';
    const [transRows, chimeRows, cashappRows] = await Promise.all([
      db.sequelize.query(
        `SELECT type, COUNT(*)::int AS count FROM user_transactions WHERE user_id IN (:userIds)${dateClause} GROUP BY type`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT COUNT(*)::int AS count FROM chime_cashapp_withdrawal_requests WHERE user_id IN (:userIds) AND status = 'completed' AND payout_type = 'chime'${dateClause.replace(/"created_at"/g, 'updated_at')}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.sequelize.query(
        `SELECT COUNT(*)::int AS count FROM chime_cashapp_withdrawal_requests WHERE user_id IN (:userIds) AND status = 'completed' AND payout_type = 'cashapp'${dateClause.replace(/"created_at"/g, 'updated_at')}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT }
      )
    ]);

    const byDbType = {};
    (Array.isArray(transRows) ? transRows : []).forEach((r) => { byDbType[r.type] = (byDbType[r.type] || 0) + r.count; });
    
    const recharge = byDbType.deposit || 0;
    const chime = Number(chimeRows?.[0]?.count) || 0;
    const cashapp = Number(cashappRows?.[0]?.count) || 0;
    // Subtract Chime/CashApp from general Withdraw count to avoid double counting in the chart bars
    const withdraw = Math.max(0, (byDbType.withdraw || 0) - chime - cashapp);

    if (realMoneyOnly) {
      return [
        { type: 'Recharge', count: recharge },
        { type: 'Withdraw', count: withdraw },
        { type: 'Chime', count: chime },
        { type: 'CashApp', count: cashapp }
      ];
    }
    const bonus = (byDbType.promotion || 0) + (byDbType.vip_bonus || 0) + (byDbType.affiliate || 0) + (byDbType.spin_wheel || 0);
    return [
      { type: 'Recharge', count: recharge },
      { type: 'Withdraw', count: withdraw },
      { type: 'Chime', count: chime },
      { type: 'CashApp', count: cashapp },
      { type: 'Bonus', count: bonus }
    ];
  }

  const [transRows, chimeCount, cashappCount] = await Promise.all([
    db.UserTransaction.findAll({
      where: baseWhere,
      attributes: ['type'],
      raw: true
    }),
    db.ChimeCashappWithdrawalRequest.count({ where: { ...baseWhere, status: 'completed', payoutType: 'chime', updatedAt: { [Op.gte]: from, [Op.lte]: to } } }),
    db.ChimeCashappWithdrawalRequest.count({ where: { ...baseWhere, status: 'completed', payoutType: 'cashapp', updatedAt: { [Op.gte]: from, [Op.lte]: to } } })
  ]);

  const byDbType = {};
  (transRows || []).forEach((r) => { byDbType[r.type] = (byDbType[r.type] || 0) + 1; });
  
  const recharge = byDbType.deposit || 0;
  const chime = Number(chimeCount) || 0;
  const cashapp = Number(cashappCount) || 0;
  // Subtract Chime/CashApp from general Withdraw count to avoid double counting in the chart bars
  const withdraw = Math.max(0, (byDbType.withdraw || 0) - chime - cashapp);

  if (realMoneyOnly) {
    return [
      { type: 'Recharge', count: recharge },
      { type: 'Withdraw', count: withdraw },
      { type: 'Chime', count: chime },
      { type: 'CashApp', count: cashapp }
    ];
  }
  const bonus = (byDbType.promotion || 0) + (byDbType.vip_bonus || 0) + (byDbType.affiliate || 0) + (byDbType.spin_wheel || 0);
  return [
    { type: 'Recharge', count: recharge },
    { type: 'Withdraw', count: withdraw },
    { type: 'Chime', count: chime },
    { type: 'CashApp', count: cashapp },
    { type: 'Bonus', count: bonus }
  ];
}

module.exports = { getReportsBreakdown };
