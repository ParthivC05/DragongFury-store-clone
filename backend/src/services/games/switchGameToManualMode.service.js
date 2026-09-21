'use strict';

const db = require('../../db/models');
const { sendGameSwitchedToManualModeEmail } = require('../../utils/email');
const { getRecipientEmailsForGame } = require('./gameBalanceAlert.service');
const { sendAutomationUpdateInAppNotifications } = require('./gameAutomationInAppNotify.service');
const {
  formatAutomationApiError,
  formatAutomationApiErrors,
  recordGameManualModeLog
} = require('./recordGameManualModeLog.service');
const { recordGameHistoryModeSwitch } = require('./recordGameHistory.service');
const { logger } = require('../../libs/logger');

/**
 * Check if we have already sent the "game switched to manual mode" email for this game today.
 * In-app notifications are sent every time; only email is limited to once per game per day.
 * @param {number} gameId
 * @returns {Promise<boolean>} true if we can send email (no send today yet)
 */
async function canSendManualModeAlertToday(gameId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.GameManualModeAlertSent.findByPk(gameId, { attributes: ['lastSentDate'], raw: true });
  if (!row) return true;
  return row.lastSentDate !== today;
}

/**
 * Record that we sent the manual mode email for this game today.
 * @param {number} gameId
 */
async function recordManualModeAlertSent(gameId) {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.GameManualModeAlertSent.findOrCreate({
    where: { gameId },
    defaults: { gameId, lastSentDate: today }
  });
  if (row) await row.update({ lastSentDate: today });
}

function buildFailureSummary(failureDetails, reasonSummary, operationType, gameUsername, externalResponse) {
  if (Array.isArray(failureDetails) && failureDetails.length > 0) {
    return formatAutomationApiErrors(failureDetails);
  }
  return formatAutomationApiError({
    reasonSummary,
    operationType,
    gameUsername,
    externalResponse
  });
}

function buildDisplayReason(failureDetails, reasonSummary) {
  if (Array.isArray(failureDetails) && failureDetails.length > 0) {
    return reasonSummary || `Automation failed for ${failureDetails.length} different users on this game.`;
  }
  return reasonSummary || null;
}

/**
 * Switch a game to manual mode (botOffline = true).
 * In-app notifications: sent every time to related admins (master admin sees store + game + reason; store admin sees game + reason).
 * Email: once per game per day to avoid spam.
 * @param {{
 *   gameId: number,
 *   gameName?: string,
 *   reasonSummary?: string,
 *   gameUsername?: string,
 *   externalResponse?: *,
 *   operationType?: string,
 *   failureDetails?: Array
 * }} opts
 * @returns {Promise<void>}
 */
async function switchGameToManualMode(opts) {
  const {
    gameId,
    gameName,
    reasonSummary,
    gameUsername,
    externalResponse,
    operationType,
    failureDetails
  } = opts;
  if (!gameId) return;

  try {
    const game = await db.Game.findByPk(gameId, {
      attributes: ['id', 'name', 'botOffline', 'addedByStoreCode', 'botUsername', 'botPassword']
    });
    if (!game) return;

    const wasAutomated = !game.botOffline;
    await game.update({ botOffline: true });

    const automationApiError = buildFailureSummary(
      failureDetails,
      reasonSummary,
      operationType,
      gameUsername,
      externalResponse
    );
    const displayReason = buildDisplayReason(failureDetails, reasonSummary);

    if (wasAutomated) {
      await recordGameHistoryModeSwitch(
        game,
        {
          wasManual: false,
          isManual: true,
          details: automationApiError
        },
        {
          changedByUserId: null,
          changedByName: 'System (automation failure)',
          changedByRole: 'system',
          triggerSource: 'automation_failure'
        }
      );
      await recordGameManualModeLog({
        game,
        automationApiError,
        triggerSource: 'automation_failure'
      });
    }

    const displayGameName = gameName || game.name || 'Unknown Game';
    const storeCode = game.addedByStoreCode && String(game.addedByStoreCode).trim();
    const hasStorePartner = !!storeCode;
    const gameForRecipients = { id: game.id, name: game.name, addedByStoreCode: game.addedByStoreCode };

    const operation = operationType ? ` (${operationType})` : '';
    const titleForMaster = hasStorePartner
      ? `Store "${storeCode}" – Game "${displayGameName}" switched to manual mode${operation}`
      : `Platform game "${displayGameName}" switched to manual mode${operation}`;
    const messageForMaster = hasStorePartner
      ? `Store: ${storeCode}. Game: ${displayGameName}. Reason: ${displayReason}`
      : `Platform-level game (no store partner). Game: ${displayGameName}. Reason: ${displayReason}`;
    const titleForStore = `Game "${displayGameName}" switched to manual mode${operation}`;
    const messageForStore = `${displayGameName}. Reason: ${displayReason}`;
    await sendAutomationUpdateInAppNotifications(gameForRecipients, {
      titleForMaster,
      messageForMaster,
      titleForStore,
      messageForStore,
      actionUrl: '/admin/games',
      type: 'game_manual_mode'
    });

    // Email: once per game per day
    const canSendEmail = await canSendManualModeAlertToday(gameId);
    if (canSendEmail) {
      const recipients = await getRecipientEmailsForGame(gameForRecipients);
      if (recipients.length > 0) {
        const payload = {
          gameName: displayGameName,
          reasonSummary: displayReason,
          gameUsername,
          externalResponse,
          operationType,
          failureDetails,
          ...(hasStorePartner ? { storeCode } : {})
        };
        await Promise.all(recipients.map((to) => sendGameSwitchedToManualModeEmail(to, payload)));
        await recordManualModeAlertSent(gameId);
      } else {
        logger.warn(
          { gameId, gameName: game.name },
          'No recipients for manual mode alert email. Set GAME_BALANCE_ALERT_EMAIL or ensure game has store with active store_admin users.'
        );
      }
    }
  } catch (err) {
    logger.error({ err, gameId }, 'Failed to switch game to manual mode or send alert email');
  }
}

module.exports = {
  canSendManualModeAlertToday,
  recordManualModeAlertSent,
  switchGameToManualMode
};
