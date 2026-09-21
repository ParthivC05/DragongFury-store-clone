const { getVipLevelsConfig } = require('./getVipLevelsConfig.service');
const { getUserVipStatus } = require('./getUserVipStatus.service');
const { addVipXp } = require('./addVipXp.service');
const { getVipWithdrawalLimits } = require('./getVipWithdrawalLimits.service');
const { getVipLedgerHistory } = require('./getVipLedgerHistory.service');
const { getVipFaq } = require('./getVipFaq.service');
const { getVipSettings } = require('./getVipSettings.service');
const { updateVipSettings } = require('./updateVipSettings.service');
const { resetVipSettingsToDefault } = require('./resetVipSettingsToDefault.service');

module.exports = {
  getVipLevelsConfig,
  getUserVipStatus,
  addVipXp,
  getVipWithdrawalLimits,
  getVipLedgerHistory,
  getVipFaq,
  getVipSettings,
  updateVipSettings,
  resetVipSettingsToDefault
};
