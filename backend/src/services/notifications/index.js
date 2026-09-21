const { listNotifications, getUnreadCount, markRead } = require('./listNotifications.service');
const {
  registerDeviceToken,
  unregisterDeviceToken,
  upsertPushDevice,
  unlinkPushDevice
} = require('./deviceToken.service');

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  registerDeviceToken,
  unregisterDeviceToken,
  upsertPushDevice,
  unlinkPushDevice
};
