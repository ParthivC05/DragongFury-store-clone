const settings = require('./getNewUserDepositBonusSettings.service');
const apply = require('./applyNewUserDepositBonus.service');

module.exports = {
  ...settings,
  ...apply
};
