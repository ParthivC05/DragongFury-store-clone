'use strict';

const db = require('../../db/models');
const { logger } = require('../../libs/logger');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { ROLES } = require('../../constants/roles');
const { getRecipientUserIdsByRole } = require('./gameBalanceAlert.service');

async function getDistributorAdminUserIds(distributorCode) {
  const code = distributorCode && String(distributorCode).trim();
  if (!code) return [];
  const rows = await db.User.findAll({
    where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode: code, isActive: true },
    attributes: ['userId'],
    raw: true
  });
  return rows.map((r) => r.userId).filter((id) => id != null);
}

/**
 * Notify store, distributor, and master admins when a player queues a manual game request (register / deposit / redeem).
 * @param {{
 *   gameId: number,
 *   requestType: string,
 *   amount?: number|null,
 *   gameCredit?: number|null,
 *   userId?: number|null,
 *   distributorCode?: string|null
 * }} opts
 */
async function notifyAdminsManualRequestQueued(opts) {
  const { gameId, requestType, amount, gameCredit, userId, distributorCode: distributorCodeOpt } = opts;
  if (!gameId || !requestType || !db.Notification) return;

  try {
    const game = await db.Game.findByPk(gameId, {
      attributes: ['id', 'name', 'addedByStoreCode']
    });
    if (!game) return;

    const user = userId
      ? await db.User.findByPk(userId, { attributes: ['userId', 'username', 'email', 'distributorCode'] })
      : null;
    const userLabel = user?.username || user?.email || (userId != null ? `User #${userId}` : 'A player');
    const distributorCode =
      (distributorCodeOpt && String(distributorCodeOpt).trim()) ||
      (user?.distributorCode && String(user.distributorCode).trim()) ||
      null;

    const storeCode = game.addedByStoreCode && String(game.addedByStoreCode).trim();
    const hasStorePartner = !!storeCode;
    const gameName = game.name || 'Unknown game';

    const typeLabels = { register: 'registration', deposit: 'top-up', redeem: 'redeem' };
    const typeLabel = typeLabels[requestType] || String(requestType);
    let amountPart = '';
    if (amount != null && requestType !== 'register') {
      const walletStr = Number(amount).toFixed(2);
      if (gameCredit != null && Number(gameCredit) !== Number(amount)) {
        amountPart = ` Wallet: ${walletStr} SC. Credit in game: ${Number(gameCredit).toFixed(2)} SC.`;
      } else {
        amountPart = ` Amount: ${walletStr} SC.`;
      }
    }

    const titleForMaster = hasStorePartner
      ? `Manual request: ${typeLabel} – ${gameName} (store ${storeCode})`
      : `Manual request: ${typeLabel} – ${gameName}`;
    const messageForMaster = `${userLabel} submitted a pending ${typeLabel} for "${gameName}".${amountPart} Review in Game manual requests.`;
    const titleForStore = `New manual ${typeLabel} request`;
    const messageForStore = `${userLabel} needs a ${typeLabel} for "${gameName}".${amountPart}`;

    const { masterAdminIds, storeAdminIds } = await getRecipientUserIdsByRole(game);
    const distributorAdminIds = await getDistributorAdminUserIds(distributorCode);
    const createNotif = (uid, title, message) =>
      db.Notification.create({
        userId: uid,
        type: 'game_manual_request_queued',
        category: NOTIFICATION_CATEGORIES.MANUAL_REQUESTS,
        title,
        message,
        actionUrl: '/admin/game-manual-requests'
      }).catch((err) =>
        logger.warn({ err, userId: uid, gameId }, 'Failed to create manual request queue notification')
      );

    await Promise.all([
      ...masterAdminIds.map((uid) => createNotif(uid, titleForMaster, messageForMaster)),
      ...distributorAdminIds.map((uid) => createNotif(uid, titleForMaster, messageForMaster)),
      ...storeAdminIds.map((uid) => createNotif(uid, titleForStore, messageForStore))
    ]);
  } catch (err) {
    logger.warn({ err, gameId, requestType }, 'notifyAdminsManualRequestQueued failed');
  }
}

module.exports = { notifyAdminsManualRequestQueued };
