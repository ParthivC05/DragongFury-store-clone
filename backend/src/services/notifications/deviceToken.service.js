'use strict';

const {
  registerDeviceToken,
  unregisterDeviceToken,
  upsertPushDevice,
  unlinkPushDevice
} = require('../pushCampaigns/deviceRegistry.service');

module.exports = {
  registerDeviceToken,
  unregisterDeviceToken,
  upsertPushDevice,
  unlinkPushDevice
};
