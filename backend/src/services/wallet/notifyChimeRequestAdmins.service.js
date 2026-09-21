'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { logger } = require('../../libs/logger');

/**
 * Platform recipients for every store:
 * - super admin: master_admin with no admin_role_id
 * - technical staff: master_admin with admin_role_id
 * @returns {Promise<number[]>}
 */
async function getPlatformAdminUserIds() {
  const rows = await db.User.findAll({
    where: { role: ROLES.MASTER_ADMIN, isActive: true },
    attributes: ['userId'],
    raw: true
  });
  return [...new Set(rows.map((r) => r.userId).filter((id) => id != null))];
}

/**
 * Store admins for one store only (their players' Chime deposit / withdrawal requests).
 * @param {string|null|undefined} storeCode
 * @returns {Promise<number[]>}
 */
async function getStoreAdminUserIdsForStore(storeCode) {
  const code = storeCode != null ? String(storeCode).trim() : '';
  if (!code) return [];
  const rows = await db.User.findAll({
    where: {
      role: ROLES.STORE_ADMIN,
      storeCode: code,
      isActive: true
    },
    attributes: ['userId'],
    raw: true
  });
  return [...new Set(rows.map((r) => r.userId).filter((id) => id != null))];
}

/**
 * Recipients:
 * - Store admin: only the player's store
 * - Super admin + technical staff (all master_admin): every store's Chime deposit and withdrawal
 *
 * @param {{
 *   storeCode?: string|null,
 *   type: string,
 *   title: string,
 *   message: string,
 *   actionUrl: string,
 *   titleForMaster?: string,
 *   messageForMaster?: string
 * }} opts
 */
async function notifyChimeRequestAdmins(opts) {
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
    const [storeAdminIds, platformAdminIds] = await Promise.all([
      getStoreAdminUserIdsForStore(storeCode),
      getPlatformAdminUserIds()
    ]);

    // Prefer store-scoped copy for store admins; platform admins always get store-labeled copy.
    const platformTitle = titleForMaster || title;
    const platformMessage = messageForMaster || message;

    // Avoid double-notify if a user somehow appears in both lists.
    const platformOnlyIds = platformAdminIds.filter((id) => !storeAdminIds.includes(id));

    const createNotif = (userId, notifTitle, notifMessage) =>
      db.Notification.create({
        userId,
        type,
        category: NOTIFICATION_CATEGORIES.MANUAL_REQUESTS,
        title: notifTitle,
        message: notifMessage,
        actionUrl
      }).catch((err) =>
        logger.warn({ err, userId, type }, 'Failed to create Chime request notification')
      );

    await Promise.all([
      ...storeAdminIds.map((userId) => createNotif(userId, title, message)),
      ...platformOnlyIds.map((userId) => createNotif(userId, platformTitle, platformMessage))
    ]);
  } catch (err) {
    logger.warn({ err, type, storeCode }, 'notifyChimeRequestAdmins failed');
  }
}

module.exports = {
  getPlatformAdminUserIds,
  getMasterAdminUserIds: getPlatformAdminUserIds,
  getStoreAdminUserIds: getStoreAdminUserIdsForStore,
  getStoreAdminUserIdsForStore,
  notifyChimeRequestAdmins
};
