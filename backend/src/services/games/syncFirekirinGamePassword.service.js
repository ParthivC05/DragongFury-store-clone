'use strict';

const db = require('../../db/models');
const { withBotRetry } = require('../../utils/botApiHelper');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const {
  isFirekirinTerminalGame,
  queryFirekirinUserBalanceWithAgentLogin,
  FIREKIRIN_PASSWORD_MIN
} = require('./firekirin.helpers');
const { isFirekirinBotAutomationGame } = require('../../utils/gameIntegration.helpers');

/**
 * Verify the user's current Firekirin password via queryInfo, persist it, and return balance.
 */
async function syncFirekirinGamePassword(userId, gameId, gamePassword, storeCode = null) {
  const plainPassword = gamePassword != null ? String(gamePassword) : '';
  if (!plainPassword.trim()) {
    const err = new Error('Game password is required.');
    err.statusCode = 400;
    throw err;
  }
  if (plainPassword.length < FIREKIRIN_PASSWORD_MIN) {
    const err = new Error(`Password must be at least ${FIREKIRIN_PASSWORD_MIN} characters.`);
    err.statusCode = 400;
    throw err;
  }

  const game = await db.Game.findByPk(gameId);
  if (!game || !game.isActive) {
    const err = new Error('Game not found.');
    err.statusCode = 404;
    throw err;
  }

  const isFirekirinAgent = isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game);
  if (!isFirekirinAgent) {
    const err = new Error('Password sync is only supported for Firekirin agent games.');
    err.statusCode = 400;
    throw err;
  }

  const userGameAccount = await db.UserGameAccount.findOne({
    where: { userId, gameId: game.id }
  });
  if (!userGameAccount || !userGameAccount.botUsername) {
    const err = new Error('You do not have a registered account for this game.');
    err.statusCode = 404;
    throw err;
  }

  const logContext = buildBotLogContext({
    game,
    operation: 'balance',
    storeCode,
    gameUsername: userGameAccount.botUsername,
    apiEndpoint: '/ws/service.ashx?action=queryInfo'
  });

  try {
    const result = await withBotRetry(
      () => queryFirekirinUserBalanceWithAgentLogin(
        game,
        userGameAccount.botUsername,
        plainPassword
      ),
      { logContext }
    );

    await userGameAccount.update({
      botPassword: plainPassword.slice(0, 256),
      status: 'active'
    });

    return {
      success: true,
      message: 'Password updated successfully.',
      balance: result.balance
    };
  } catch (err) {
    if (err.isInvalidPassword || /pass\s*word/i.test(String(err.message || ''))) {
      const badPassErr = new Error('Incorrect game password. Please check and try again.');
      badPassErr.statusCode = 400;
      badPassErr.code = 'GAME_INVALID_PASSWORD';
      throw badPassErr;
    }
    throw err;
  }
}

module.exports = { syncFirekirinGamePassword };
