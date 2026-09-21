'use strict';

const db = require('../../db/models');
const { logger } = require('../../libs/logger');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { ROLES } = require('../../constants/roles');
const { getRecipientUserIdsByRole } = require('./gameBalanceAlert.service');

async function getDistributorAdminIdsForStoreGame(gameForRecipients) {
  const storeCode =
    gameForRecipients?.addedByStoreCode && String(gameForRecipients.addedByStoreCode).trim();
  if (!storeCode) return [];
  const sr = await db.StoreRole.findOne({
    where: { storeCode },
    attributes: ['distributorCode'],
    raw: true
  });
  const dist = sr?.distributorCode && String(sr.distributorCode).trim();
  if (!dist) return [];
  const users = await db.User.findAll({
    where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode: dist, isActive: true },
    attributes: ['userId'],
    raw: true
  });
  return users.map((u) => u.userId).filter((id) => id != null);
}

/**
 * In-app notifications to master_admin + store_admin for game automation / manual-mode changes.
 * @param {{ id: number, name?: string|null, addedByStoreCode?: string|null }} gameForRecipients
 * @param {{
 *   titleForMaster: string,
 *   messageForMaster: string,
 *   titleForStore: string,
 *   messageForStore: string,
 *   actionUrl?: string|null,
 *   type?: string
 * }} content
 */
async function sendAutomationUpdateInAppNotifications(gameForRecipients, content) {
  if (!db.Notification || !gameForRecipients?.id) return;
  const {
    titleForMaster,
    messageForMaster,
    titleForStore,
    messageForStore,
    actionUrl = '/admin/games',
    type = 'game_automation_update'
  } = content;
  const { masterAdminIds, storeAdminIds } = await getRecipientUserIdsByRole(gameForRecipients);
  const distributorAdminIds = await getDistributorAdminIdsForStoreGame(gameForRecipients);
  const createNotif = (userId, title, message) =>
    db.Notification.create({
      userId,
      type,
      category: NOTIFICATION_CATEGORIES.AUTOMATION_UPDATES,
      title,
      message,
      actionUrl: actionUrl || null
    }).catch((err) =>
      logger.warn({ err, userId, gameId: gameForRecipients.id }, 'Failed to create automation update notification')
    );
  await Promise.all([
    ...masterAdminIds.map((userId) => createNotif(userId, titleForMaster, messageForMaster)),
    ...distributorAdminIds.map((userId) => createNotif(userId, titleForMaster, messageForMaster)),
    ...storeAdminIds.map((userId) => createNotif(userId, titleForStore, messageForStore))
  ]);
}

module.exports = { sendAutomationUpdateInAppNotifications };
