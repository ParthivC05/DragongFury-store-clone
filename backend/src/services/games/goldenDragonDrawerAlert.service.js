'use strict';

const db = require('../../db/models');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { sendGoldenDragonDrawerAlertEmail } = require('../../utils/email');
const { logger } = require('../../libs/logger');
const { getGoldenDragonDrawerErrorInfo } = require('../../utils/botApiHelper');
const {
  getRecipientEmailsForGame,
  getRecipientUserIdsByRole
} = require('./gameBalanceAlert.service');
const { isGoldenDragonGame } = require('./goldenDragon.helpers');

function isGoldenDragonGameName(name) {
  return isGoldenDragonGame(name, name);
}

async function canSendDrawerAlertEmailToday(gameId) {
  if (!gameId || !db.GameGoldenDragonDrawerAlertSent) return false;
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.GameGoldenDragonDrawerAlertSent.findByPk(gameId, {
    attributes: ['lastSentDate'],
    raw: true
  });
  if (!row) return true;
  return row.lastSentDate !== today;
}

async function recordDrawerAlertSent(gameId) {
  if (!gameId || !db.GameGoldenDragonDrawerAlertSent) return;
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.GameGoldenDragonDrawerAlertSent.findOrCreate({
    where: { gameId },
    defaults: { gameId, lastSentDate: today }
  });
  if (row) await row.update({ lastSentDate: today });
}

/**
 * Notify store partners and master admins when Golden Dragon returns a drawer/moneybox error.
 * In-app: every occurrence. Email: at most once per game per day.
 * @param {{ gameId?: number|null, gameName?: string|null, storeCode?: string|null, operation?: string, botMessage?: string }} opts
 */
async function trySendGoldenDragonDrawerAlert(opts = {}) {
  const { gameId, gameName, storeCode, operation, botMessage } = opts;
  if (!isGoldenDragonGameName(gameName)) return;

  try {
    let gameForRecipients = null;
    if (gameId) {
      gameForRecipients = await db.Game.findByPk(gameId, {
        attributes: ['id', 'name', 'addedByStoreCode'],
        raw: true
      });
    }
    if (!gameForRecipients) {
      const code = storeCode && String(storeCode).trim();
      if (!code && !gameName) return;
      gameForRecipients = {
        id: gameId || 0,
        name: gameName || 'Golden Dragon',
        addedByStoreCode: code || null
      };
    }

    const displayGameName = gameName || gameForRecipients.name || 'Golden Dragon';
    const displayReason =
      botMessage ||
      'Golden Dragon drawer (moneybox) must be filled with an initial amount. Update it in your store profile.';
    const opLabel = operation ? String(operation) : 'API call';

    if (db.Notification) {
      const resolvedStoreCode =
        gameForRecipients.addedByStoreCode && String(gameForRecipients.addedByStoreCode).trim();
      const hasStorePartner = !!resolvedStoreCode;
      const { masterAdminIds, storeAdminIds } = await getRecipientUserIdsByRole(gameForRecipients);
      const titleForMaster = hasStorePartner
        ? `Store "${resolvedStoreCode}" – Golden Dragon drawer required`
        : `Golden Dragon drawer required – ${displayGameName}`;
      const messageForMaster = hasStorePartner
        ? `Store: ${resolvedStoreCode}. Game: ${displayGameName}. Operation: ${opLabel}. ${displayReason}`
        : `Game: ${displayGameName}. Operation: ${opLabel}. ${displayReason}`;
      const titleForStore = `Golden Dragon drawer required – ${displayGameName}`;
      const messageForStore = `${displayGameName} (${opLabel}). ${displayReason}`;
      const createNotif = (userId, title, message) =>
        db.Notification.create({
          userId,
          type: 'golden_dragon_drawer_alert',
          category: NOTIFICATION_CATEGORIES.OTHER,
          title,
          message,
          actionUrl: '/admin/profile'
        }).catch((err) =>
          logger.warn({ err, userId, gameId }, 'Failed to create Golden Dragon drawer alert notification')
        );
      await Promise.all([
        ...masterAdminIds.map((userId) => createNotif(userId, titleForMaster, messageForMaster)),
        ...storeAdminIds.map((userId) => createNotif(userId, titleForStore, messageForStore))
      ]);
    }

    if (!gameId) return;
    const canSendEmail = await canSendDrawerAlertEmailToday(gameId);
    if (!canSendEmail) return;
    const recipients = await getRecipientEmailsForGame(gameForRecipients);
    if (recipients.length === 0) {
      logger.warn(
        { gameId, gameName: displayGameName },
        'No recipients for Golden Dragon drawer alert email'
      );
      return;
    }
    const payload = {
      gameName: displayGameName,
      operation: opLabel,
      botMessage: displayReason,
      storeCode: gameForRecipients.addedByStoreCode || storeCode || null
    };
    await Promise.all(recipients.map((to) => sendGoldenDragonDrawerAlertEmail(to, payload)));
    await recordDrawerAlertSent(gameId);
  } catch (err) {
    logger.error({ err, gameId, gameName }, 'Failed to send Golden Dragon drawer alert');
  }
}

/**
 * Fire-and-forget when a bot/provider error may be a Golden Dragon drawer issue.
 * @returns {Promise<boolean>} true if a drawer alert was sent
 */
async function maybeNotifyGoldenDragonDrawerError(err, context = {}) {
  const drawerInfo = getGoldenDragonDrawerErrorInfo(err);
  if (!drawerInfo.isDrawerError) return false;
  if (!isGoldenDragonGameName(context.gameName)) return false;
  await trySendGoldenDragonDrawerAlert({
    gameId: context.gameId,
    gameName: context.gameName,
    storeCode: context.storeCode,
    operation: context.operation,
    botMessage: drawerInfo.message
  });
  return true;
}

module.exports = {
  trySendGoldenDragonDrawerAlert,
  maybeNotifyGoldenDragonDrawerError,
  isGoldenDragonGameName
};
