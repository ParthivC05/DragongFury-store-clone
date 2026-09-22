'use strict';

const db = require('../../db/models');
const { getFirebaseMessaging } = require('../../libs/firebaseAdmin');
const { createLogger } = require('../../libs/logger');

const log = createLogger('fcm');
const debugFcm = process.env.FCM_DEBUG === 'true' || process.env.NODE_ENV !== 'production';

function isInvalidTokenError(code = '') {
  return (
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-registration-token')
  );
}

/**
 * Send FCM push for an in-app notification row (best-effort; never throws to callers).
 */
async function sendPushForNotification(notification) {
  try {
    if (!notification?.userId) return;

    const rows = await db.UserDeviceToken.findAll({
      where: { userId: notification.userId },
      attributes: ['id', 'token', 'storeCode']
    });
    if (!rows.length) return;

    const byStore = new Map();
    for (const row of rows) {
      if (!row.token) continue;
      const store = String(row.storeCode || '').trim() || 'default';
      if (!byStore.has(store)) byStore.set(store, []);
      byStore.get(store).push(row.token);
    }
    if (!byStore.size) return;

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

    const invalidTokens = [];
    let successCount = 0;
    let failureCount = 0;

    for (const [storeCode, tokens] of byStore.entries()) {
      const messaging = getFirebaseMessaging(storeCode === 'default' ? '' : storeCode);
      if (!messaging) {
        failureCount += tokens.length;
        continue;
      }
      const message = {
        tokens,
        notification: { title, body },
        data
      };
      if (typeof actionUrl === 'string' && /^https?:\/\//i.test(actionUrl)) {
        message.webpush = { fcmOptions: { link: actionUrl } };
      }
      const response = await messaging.sendEachForMulticast(message);
      response.responses.forEach((res, idx) => {
        if (res.success) {
          successCount += 1;
          return;
        }
        failureCount += 1;
        const code = res.error?.code || '';
        const errMessage = res.error?.message || 'unknown';
        if (debugFcm) {
          log.warn('FCM push failure', { notificationId: notification.id, code, message: errMessage, storeCode });
        }
        if (isInvalidTokenError(code)) {
          invalidTokens.push(tokens[idx]);
        } else {
          log.warn('FCM send failed', { code, message: errMessage, storeCode });
        }
      });
    }

    if (debugFcm) {
      log.info('FCM send complete', {
        notificationId: notification.id,
        successCount,
        failureCount
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
