'use strict';

const db = require('../../db/models');
const { getFirebaseMessaging } = require('../../libs/firebaseAdmin');
const { createLogger } = require('../../libs/logger');

const log = createLogger('fcm');
const debugFcm = process.env.FCM_DEBUG === 'true' || process.env.NODE_ENV !== 'production';

/**
 * Send FCM push for an in-app notification row (best-effort; never throws to callers).
 */
async function sendPushForNotification(notification) {
  try {
    const messaging = getFirebaseMessaging();
    if (!messaging || !notification?.userId) return;

    const rows = await db.UserDeviceToken.findAll({
      where: { userId: notification.userId },
      attributes: ['id', 'token']
    });
    if (!rows.length) return;

    const tokens = rows.map((r) => r.token).filter(Boolean);
    if (!tokens.length) return;

    const title = notification.title || 'Notification';
    const body = notification.message || '';
    const actionUrl = notification.actionUrl || '';
    const data = {
      notificationId: String(notification.id || ''),
      type: String(notification.type || ''),
      category: String(notification.category || 'other'),
      actionUrl: String(actionUrl),
      click_action: String(actionUrl)
    };

    const message = {
      tokens,
      notification: { title, body },
      data
    };
    if (typeof actionUrl === 'string' && /^https?:\/\//i.test(actionUrl)) {
      message.webpush = { fcmOptions: { link: actionUrl } };
    }

    const response = await messaging.sendEachForMulticast(message);

    const invalidTokens = [];
    let successCount = 0;
    response.responses.forEach((res, idx) => {
      if (res.success) {
        successCount += 1;
        return;
      }
      const code = res.error?.code || '';
      const errMessage = res.error?.message || 'unknown';
      if (debugFcm) {
        log.warn('FCM push failure', { notificationId: notification.id, code, message: errMessage });
      }
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        invalidTokens.push(tokens[idx]);
      } else {
        log.warn('FCM send failed', { code, message: errMessage });
      }
    });

    if (debugFcm) {
      log.info('FCM send complete', {
        notificationId: notification.id,
        successCount,
        failureCount: response.responses.length - successCount
      });
    }

    if (invalidTokens.length) {
      await db.UserDeviceToken.destroy({ where: { token: invalidTokens } });
    }
  } catch (err) {
    log.warn('sendPushForNotification failed', { error: err.message });
  }
}

module.exports = { sendPushForNotification };
