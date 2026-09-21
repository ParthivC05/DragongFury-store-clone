'use strict';

const config = require('../../configs/app.config');
const db = require('../../db/models');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { ROLES } = require('../../constants/roles');
const { sendGameBotBalanceAlertEmail } = require('../../utils/email');
const { logger } = require('../../libs/logger');

/**
 * Get fallback emails from config (GAME_BALANCE_ALERT_EMAIL). Used when no store admins
 * exist for the game's store, or for platform-level games, so someone always receives alerts.
 */
function getFallbackAlertEmails() {
  return (config.get('email.gameBalanceAlertEmail') || '').split(',').map((e) => e.trim()).filter(Boolean);
}

/**
 * Get all active master_admin users' emails (for manual-mode and balance alerts).
 * When there are multiple master admins, all of them receive the email.
 * @returns {Promise<string[]>}
 */
async function getMasterAdminEmails() {
  const users = await db.User.findAll({
    where: {
      role: ROLES.MASTER_ADMIN,
      isActive: true
    },
    attributes: ['email'],
    raw: true
  });
  return users.map((u) => u.email).filter((e) => e && String(e).trim());
}

/**
 * Get emails for manual-mode and balance-low alerts:
 * - All active master_admin users (every master admin receives the email).
 * - When game has addedByStoreCode: store partner(s), i.e. all active store_admin users for that store.
 * - When storeCode is present but no store users are found (failing lookup): master admins and fallback still receive.
 * - Fallback from GAME_BALANCE_ALERT_EMAIL when configured.
 * @param {object} game - Game with id, name, addedByStoreCode
 * @returns {Promise<string[]>} Unique email addresses to notify
 */
async function getRecipientEmailsForGame(game) {
  if (!game) return [];
  const fallback = getFallbackAlertEmails();
  const masterAdminEmails = await getMasterAdminEmails();
  const storeCode = game.addedByStoreCode && String(game.addedByStoreCode).trim();
  let storePartnerEmails = [];
  if (storeCode) {
    const storeUsers = await db.User.findAll({
      where: {
        storeCode,
        role: ROLES.STORE_ADMIN,
        isActive: true
      },
      attributes: ['email'],
      raw: true
    });
    storePartnerEmails = storeUsers.map((u) => u.email).filter((e) => e && String(e).trim());
    if (storePartnerEmails.length === 0) {
      logger.warn(
        { gameId: game.id, storeCode },
        'No active store_admin users found for game store; master admins and fallback will still receive alerts'
      );
    }
  }
  const combined = [...masterAdminEmails, ...storePartnerEmails, ...fallback];
  return [...new Set(combined)];
}

/**
 * Get user IDs for manual-mode (and balance) in-app notifications:
 * all active master_admin users and, when game has addedByStoreCode, all active store_admin users for that store.
 * Used to create in-app notifications (no fallback emails, as they may not have user accounts).
 * @param {object} game - Game with id, name, addedByStoreCode
 * @returns {Promise<number[]>} Unique user IDs to notify
 */
async function getRecipientUserIdsForGame(game) {
  const byRole = await getRecipientUserIdsByRole(game);
  const combined = [...byRole.masterAdminIds, ...byRole.storeAdminIds];
  return [...new Set(combined)];
}

/**
 * Get recipient user IDs split by role for role-specific notification content.
 * Master admins see store name + game name + reason; store admins see game name + reason only.
 * @param {object} game - Game with id, name, addedByStoreCode
 * @returns {Promise<{ masterAdminIds: number[], storeAdminIds: number[] }>}
 */
async function getRecipientUserIdsByRole(game) {
  if (!game) return { masterAdminIds: [], storeAdminIds: [] };
  const masterAdmins = await db.User.findAll({
    where: { role: ROLES.MASTER_ADMIN, isActive: true },
    attributes: ['userId'],
    raw: true
  });
  const masterAdminIds = masterAdmins.map((u) => u.userId).filter((id) => id != null);
  const storeCode = game.addedByStoreCode && String(game.addedByStoreCode).trim();
  let storeAdminIds = [];
  if (storeCode) {
    const storeUsers = await db.User.findAll({
      where: { storeCode, role: ROLES.STORE_ADMIN, isActive: true },
      attributes: ['userId'],
      raw: true
    });
    storeAdminIds = storeUsers.map((u) => u.userId).filter((id) => id != null);
  }
  return { masterAdminIds, storeAdminIds };
}

/**
 * Check if we have already sent a balance alert for this game today.
 * Uses table: game_balance_alert_sent (game_id, last_sent_date). To re-test balance email same day, delete row(s): DELETE FROM game_balance_alert_sent WHERE game_id = <id>; or DELETE FROM game_balance_alert_sent;
 * @param {number} gameId
 * @returns {Promise<boolean>} true if we can send (no send today yet)
 */
async function canSendBalanceAlertToday(gameId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.GameBalanceAlertSent.findByPk(gameId, { attributes: ['lastSentDate'], raw: true });
  if (!row) return true;
  return row.lastSentDate !== today;
}

/**
 * Record that we sent a balance alert for this game today.
 * @param {number} gameId
 */
async function recordBalanceAlertSent(gameId) {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.GameBalanceAlertSent.findOrCreate({
    where: { gameId },
    defaults: { gameId, lastSentDate: today }
  });
  if (row) await row.update({ lastSentDate: today });
}

/**
 * Send balance alert when a deposit/redeem fails with a bot balance error.
 * In-app notifications: sent every time, role-specific (master = store + game + reason; store = game + reason).
 * Email: at most one per game per day.
 * @param {{ gameId: number, gameName: string, operation: 'Deposit'|'Redeem', amount: number, botMessage: string, game?: object }} opts
 */
async function trySendGameBalanceAlert(opts) {
  const { gameId, gameName, operation, amount, botMessage, game } = opts;
  if (!gameId) return;
  try {
    const gameForRecipients = game || await db.Game.findByPk(gameId, {
      attributes: ['id', 'name', 'addedByStoreCode'],
      raw: true
    });
    if (!gameForRecipients) return;
    const displayGameName = gameName || gameForRecipients.name || 'Unknown Game';
    const displayReason = botMessage || 'Low balance with game provider.';

    // In-app notifications: every time, role-specific content
    if (db.Notification) {
      const storeCode = gameForRecipients.addedByStoreCode && String(gameForRecipients.addedByStoreCode).trim();
      const hasStorePartner = !!storeCode;
      const { masterAdminIds, storeAdminIds } = await getRecipientUserIdsByRole(gameForRecipients);
      const titleForMaster = hasStorePartner
        ? `Store "${storeCode}" – Game "${displayGameName}" low balance`
        : `Platform game "${displayGameName}" low balance`;
      const messageForMaster = hasStorePartner
        ? `Store: ${storeCode}. Game: ${displayGameName}. Reason: ${displayReason}`
        : `Platform-level game (no store partner). Game: ${displayGameName}. Reason: ${displayReason}`;
      const titleForStore = `Game "${displayGameName}" low balance`;
      const messageForStore = `${displayGameName}. Reason: ${displayReason}`;
      const createNotif = (userId, title, message) =>
        db.Notification.create({
          userId,
          type: 'game_balance_alert',
          category: NOTIFICATION_CATEGORIES.OTHER,
          title,
          message,
          actionUrl: '/admin/games'
        }).catch((err) => logger.warn({ err, userId, gameId }, 'Failed to create balance alert in-app notification'));
      await Promise.all([
        ...masterAdminIds.map((userId) => createNotif(userId, titleForMaster, messageForMaster)),
        ...storeAdminIds.map((userId) => createNotif(userId, titleForStore, messageForStore))
      ]);
    }

    // Email: once per game per day
    const canSend = await canSendBalanceAlertToday(gameId);
    if (!canSend) return;
    const recipients = await getRecipientEmailsForGame(gameForRecipients);
    if (recipients.length === 0) {
      logger.warn(
        { gameId, gameName: displayGameName },
        'No recipients for game balance alert email. Set GAME_BALANCE_ALERT_EMAIL or ensure game has store with active store_admin users.'
      );
      return;
    }
    const payload = { gameName: displayGameName, operation, amount, botMessage };
    await Promise.all(recipients.map((to) => sendGameBotBalanceAlertEmail(to, payload)));
    await recordBalanceAlertSent(gameId);
  } catch (err) {
    logger.error({ err, gameId }, 'Failed to send game balance alert email');
  }
}

module.exports = {
  getRecipientEmailsForGame,
  getRecipientUserIdsForGame,
  getRecipientUserIdsByRole,
  canSendBalanceAlertToday,
  recordBalanceAlertSent,
  trySendGameBalanceAlert
};
