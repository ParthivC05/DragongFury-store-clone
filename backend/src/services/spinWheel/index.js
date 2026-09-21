const { getSpinWheelSettings, updateSpinWheelSettings, resetSpinWheelSettingsToDefault, getSpinWheelSettingsForUser, getSpinWheelPublicConfig } = require('./getSpinWheelSettings.service');
const { getSpinWheelStatus } = require('./getSpinWheelStatus.service');
const { performSpin } = require('./performSpin.service');
const { probabilityRandomIndex } = require('./weightedRandom.service');
const spinWheelCoupon = require('./spinWheelCoupon.service');

module.exports = {
  getSpinWheelSettings,
  updateSpinWheelSettings,
  resetSpinWheelSettingsToDefault,
  getSpinWheelSettingsForUser,
  getSpinWheelPublicConfig,
  getSpinWheelStatus,
  performSpin,
  probabilityRandomIndex,
  ...spinWheelCoupon
};
