const { getGameLogsStats } = require('./getGameLogsStats.service');
const { getGameLogsSignups } = require('./getGameLogsSignups.service');
const { getGameLogsDeposits } = require('./getGameLogsDeposits.service');
const { getGameLogsWithdrawals } = require('./getGameLogsWithdrawals.service');
const { getGameLogsTrend } = require('./getGameLogsTrend.service');
const { getGameLogsBreakdown } = require('./getGameLogsBreakdown.service');
const { getGameLogsTransactions } = require('./getGameLogsTransactions.service');

module.exports = {
  getGameLogsStats,
  getGameLogsSignups,
  getGameLogsDeposits,
  getGameLogsWithdrawals,
  getGameLogsTrend,
  getGameLogsBreakdown,
  getGameLogsTransactions
};
