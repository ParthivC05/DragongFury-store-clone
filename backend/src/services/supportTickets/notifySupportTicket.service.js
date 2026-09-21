'use strict';

const db = require('../../db/models');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { logger } = require('../../libs/logger');
const { getSupportTicketAdminRecipientIds } = require('./supportTicketRecipients.service');
const { ROLES } = require('../../constants/roles');

/**
 * Notify permitted store + master admins about a support ticket event.
 */
async function notifySupportTicketAdmins(opts) {
  if (!db.Notification) return;
  const {
    storeCode,
    type,
    title,
    message,
    actionUrl,
    titleForMaster,
    messageForMaster
  } = opts || {};
  if (!type || !title || !message || !actionUrl) return;

  try {
    const recipientIds = await getSupportTicketAdminRecipientIds(storeCode);
    if (!recipientIds.length) return;

    const users = await db.User.findAll({
      where: { userId: recipientIds },
      attributes: ['userId', 'role', 'storeCode'],
      raw: true
    });

    const platformTitle = titleForMaster || title;
    const platformMessage = messageForMaster || message;
    const code = storeCode != null ? String(storeCode).trim() : '';

    const createNotif = (userId, notifTitle, notifMessage) =>
      db.Notification.create({
        userId,
        type,
        category: NOTIFICATION_CATEGORIES.OTHER,
        title: notifTitle,
        message: notifMessage,
        actionUrl
      }).catch((err) =>
        logger.warn({ err, userId, type }, 'Failed to create support ticket admin notification')
      );

    await Promise.all(
      users.map((u) => {
        const isStoreScoped =
          u.role === ROLES.STORE_ADMIN && code && String(u.storeCode || '').trim() === code;
        return createNotif(
          u.userId,
          isStoreScoped ? title : platformTitle,
          isStoreScoped ? message : platformMessage
        );
      })
    );
  } catch (err) {
    logger.warn({ err, type, storeCode }, 'notifySupportTicketAdmins failed');
  }
}

/**
 * Notify the ticket owner (player) about an admin reply / status change.
 */
async function notifySupportTicketOwner(opts) {
  if (!db.Notification) return;
  const { userId, type, title, message, actionUrl } = opts || {};
  if (!userId || !type || !title || !message || !actionUrl) return;

  try {
    await db.Notification.create({
      userId,
      type,
      category: NOTIFICATION_CATEGORIES.OTHER,
      title,
      message,
      actionUrl
    });
  } catch (err) {
    logger.warn({ err, userId, type }, 'notifySupportTicketOwner failed');
  }
}

module.exports = {
  notifySupportTicketAdmins,
  notifySupportTicketOwner
};
