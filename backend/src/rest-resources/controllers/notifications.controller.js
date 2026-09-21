const notificationsService = require('../../services/notifications');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');

async function list(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await notificationsService.listNotifications(userId, {
      limit: req.query.limit,
      offset: req.query.offset,
      unreadOnly: req.query.unread === 'true',
      category: req.query.category
    });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to load notifications.', status);
  }
}

async function unreadCount(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await notificationsService.getUnreadCount(userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to load notification count.', status);
  }
}

async function markRead(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const id = req.params.id ? parseInt(req.params.id, 10) : null;
    if (id != null && Number.isNaN(id)) return sendError(res, 'Invalid notification ID.', 400);
    await notificationsService.markRead(userId, id);
    sendSuccess(res, { message: id != null ? 'Notification marked as read.' : 'All notifications marked as read.' });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to update notification.', status);
  }
}

async function markAllRead(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    await notificationsService.markRead(userId, null);
    sendSuccess(res, { message: 'All notifications marked as read.' });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to update notifications.', status);
  }
}

async function registerDeviceToken(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await notificationsService.registerDeviceToken(
      userId,
      req.body?.token,
      req.body?.client
    );
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to register device token.', status);
  }
}

async function unregisterDeviceToken(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await notificationsService.unregisterDeviceToken(userId, req.body?.token);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to unregister device token.', status);
  }
}

async function upsertPushDevice(req, res) {
  try {
    const storeCode =
      req.body?.storeCode ||
      req.headers['x-store-code'] ||
      req.user?.storeCode ||
      '';
    const data = await notificationsService.upsertPushDevice({
      userId: req.user?.userId || null,
      deviceId: req.body?.deviceId,
      token: req.body?.token,
      permission: req.body?.permission,
      client: req.body?.client || 'user',
      storeCode,
      userAgent: req.get('user-agent')
    });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to update notification permission.', status);
  }
}

async function unlinkPushDevice(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await notificationsService.unlinkPushDevice({
      userId,
      deviceId: req.body?.deviceId,
      token: req.body?.token
    });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to unlink device.', status);
  }
}

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  registerDeviceToken,
  unregisterDeviceToken,
  upsertPushDevice,
  unlinkPushDevice
};
