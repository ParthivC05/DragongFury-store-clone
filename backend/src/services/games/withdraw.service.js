'use strict';

const axios = require('axios');
const db = require('../../db/models');
const { REDEEMABLE_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { recordRscWin } = require('../wallet/scLedger.service');
const { classifyProduct, winEventForProduct } = require('../wallet/scProduct.service');
const {
  withBotRetry,
  getBotBalanceErrorInfo,
  isBotApiFailure,
  getPlayerInGameBlockedMessage,
  getGoldenDragonDrawerBlockedMessage,
  getNoWinningsAvailableToRedeemMessage,
  captureBotApiResponse
} = require('../../utils/botApiHelper');
const { recordBotAutomationFailure } = require('./recordBotAutomationFailure.service');
const { notifyAdminsManualRequestQueued } = require('./notifyManualRequestQueued.service');
const { refreshGameBotApiKey } = require('./addGame.service');

const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const { assertGameWithdrawAmount } = require('../../utils/integerScGame.helpers');
const { assertUserCanPlayGames } = require('./gamePlayEligibility.service');
const { isGameVaultGame, callGameVaultWithdraw, generateGameVaultOrderId, withGameVaultProviderUserIdRetry } = require('./gamevault.helpers');
const { isVegasXGame, callVegasXCashierCreditsAction, withVegasXCashierTokenRetry } = require('./vegasx.helpers');
const { isGameroomAgentGame, redeemGameroomUser, withGameroomProviderUserIdRetry } = require('./gameroom.helpers');
const { isCashmachineAgentGame, redeemCashmachineUser, withCashmachineProviderUserIdRetry } = require('./cashmachine.helpers');
const { isMafiaAgentGame, redeemMafiaUser, withMafiaProviderUserIdRetry } = require('./mafia.helpers');
const { isGameroomBotAutomationGame, isCashmachineBotAutomationGame } = require('../../utils/gameIntegration.helpers');
const { GAME_WITHDRAW_PENDING } = require('../../constants/gameUserFacingMessages');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;

/**
 * Call the game bot's withdraw API.
 */
async function callBotWithdraw(baseUrl, apiKey, accountName, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/withdraw`;

  const res = await axios.post(url, { username: accountName, amount }, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('response data', res.data);
  const data = res.data;
  if (res.status !== 200 || !data || data.success !== true) {
    const botMessage = data?.message || data?.detail;
    const userMessage = botMessage
      ? `Withdrawal could not be processed: ${botMessage}`
      : 'Withdrawal could not be processed at this time. Please try again later.';
    const err = new Error(userMessage);
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
}

/**
 * Withdraw funds from a game account back into the user's wallet.
 *
 * - If the game's bot is online: calls bot API to withdraw, then credits the wallet.
 * - If the game's bot is offline: creates a manual redeem request for admin processing.
 *
 * DB transactions never stay open across bot/provider HTTP calls (avoids idle-in-transaction).
 *
 * @param {number} userId
 * @param {number} gameId
 * @param {number} amount
 */
async function withdrawGameAccount(userId, gameId, amount) {
  await assertUserCanPlayGames(userId);

  let game = null;
  let userGameAccount = null;

  try {
    game = await db.Game.findByPk(gameId, {
      attributes: [
        'id', 'name', 'gameKey', 'gameTemplateId', 'botApiUrl', 'botApiKey', 'streamlitToken',
        'botUsername', 'botPassword', 'isActive', 'botOffline', 'manualRedeemOnly', 'agentId', 'apiSecretKey'
      ]
    });

    if (!game) {
      const err = new Error('Game not found.');
      err.statusCode = 404;
      throw err;
    }

    if (!game.isActive) {
      const err = new Error('This game is currently unavailable.');
      err.statusCode = 400;
      throw err;
    }

    userGameAccount = await db.UserGameAccount.findOne({
      where: { userId, gameId: game.id }
    });

    if (!userGameAccount) {
      const err = new Error('You do not have a registered account for this game.');
      err.statusCode = 404;
      throw err;
    }

    if (!userGameAccount.botUsername) {
      const err = new Error('Your game account is not fully set up yet. Please wait for it to be activated.');
      err.statusCode = 400;
      throw err;
    }

    assertGameWithdrawAmount(amount);

    // --- BOT OFFLINE: short TX only for manual request create ---
    if (game.botOffline || game.manualRedeemOnly) {
      const user = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });

      await db.sequelize.transaction(async (transaction) => {
        await db.GameManualRequest.create({
          userId,
          gameId: game.id,
          requestType: 'redeem',
          amount,
          status: 'pending',
          storeCode: user?.storeCode || null,
          distributorCode: user?.distributorCode || null
        }, { transaction });
      });

      notifyAdminsManualRequestQueued({
        gameId: game.id,
        requestType: 'redeem',
        amount,
        userId,
        distributorCode: user?.distributorCode || null
      }).catch(() => { });

      return {
        success: true,
        pending: true,
        message: GAME_WITHDRAW_PENDING
      };
    }

    // --- BOT ONLINE: provider HTTP with no open DB transaction ---
    const isGameVault = isGameVaultGame(game);
    const isVegasXCashier = isVegasXGame(game);
    const isGameroomAgent = isGameroomAgentGame(game) && !isGameroomBotAutomationGame(game);
    const isCashmachineAgent = isCashmachineAgentGame(game) && !isCashmachineBotAutomationGame(game);
    const isMafiaAgent = isMafiaAgentGame(game);
    const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
    const withdrawLogContext = buildBotLogContext({
      game,
      operation: 'withdraw',
      storeCode: user?.storeCode,
      gameUsername: userGameAccount.botUsername,
      apiEndpoint: isVegasXCashier
        ? '/cashier/user/{id}/credits-action'
        : ((isGameroomAgent || isCashmachineAgent || isMafiaAgent)
          ? '/api/player/playerWithdraw'
          : (isGameVault ? '/api/external/withdraw' : '/withdraw'))
    });

    let creditedAmount = Number(amount);

    if (isGameVault) {
      const agentId = String(game.agentId || '').trim();
      const apiSecretKey = String(game.apiSecretKey || '').trim();
      if (!agentId || !apiSecretKey) {
        const err = new Error('This game is not available for withdrawals at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      const withdrawResult = await withGameVaultProviderUserIdRetry({
        game,
        userGameAccount,
        agentId,
        apiSecretKey,
        transaction: null,
        operation: (providerUserId) => withBotRetry(
          () => callGameVaultWithdraw(
            game,
            agentId,
            apiSecretKey,
            providerUserId,
            amount,
            generateGameVaultOrderId()
          ),
          { retryOnTimeout: false, logContext: withdrawLogContext }
        )
      });
      const providerAmount = Number(withdrawResult && withdrawResult.amount);
      if (Number.isFinite(providerAmount) && providerAmount > 0) {
        creditedAmount = providerAmount;
      }
    } else if (isVegasXCashier) {
      const providerUserId = userGameAccount.providerUserId != null
        ? String(userGameAccount.providerUserId).trim()
        : '';
      if (!providerUserId) {
        const err = new Error('Your VegasX account is missing provider ID. Please register the game account again.');
        err.statusCode = 400;
        throw err;
      }
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for withdrawals at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => withVegasXCashierTokenRetry(game, (token) => callVegasXCashierCreditsAction(
          game,
          token,
          providerUserId,
          amount,
          { withdraw: true }
        )),
        { retryOnTimeout: false, logContext: withdrawLogContext }
      );
    } else if (isGameroomAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for withdrawals at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withGameroomProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => redeemGameroomUser(game, providerUserId, amount, 'withdraw'),
          { retryOnTimeout: false, logContext: withdrawLogContext }
        )
      });
    } else if (isCashmachineAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for withdrawals at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withCashmachineProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => redeemCashmachineUser(game, providerUserId, amount, 'withdraw'),
          { retryOnTimeout: false, logContext: withdrawLogContext }
        )
      });
    } else if (isMafiaAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for withdrawals at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withMafiaProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => redeemMafiaUser(game, providerUserId, amount, 'withdraw'),
          { retryOnTimeout: false, logContext: withdrawLogContext }
        )
      });
    } else {
      if (!game.botApiUrl || !game.botApiKey) {
        const err = new Error('This game is not available for withdrawals at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }

      const onInvalidApiKey = async () => {
        const r = await refreshGameBotApiKey(game.id);
        game.botApiKey = r.api_key;
      };
      await withBotRetry(
        () => callBotWithdraw(game.botApiUrl, game.botApiKey, userGameAccount.botUsername, amount),
        { retryOnTimeout: false, onInvalidApiKey, logContext: withdrawLogContext }
      );
    }

    await db.sequelize.transaction(async (transaction) => {
      const product = classifyProduct(game);
      const win = await recordRscWin({
        userId,
        grossAmount: creditedAmount,
        creditWallet: true,
        ledger: {
          eventType: winEventForProduct(product.productId),
          sourceType: 'GAME_WITHDRAW',
          sourceId: game.id,
          productId: product.productId,
          productType: product.productType,
          providerId: product.providerId,
          gameId: product.gameId,
          remarks: `Winnings from ${product.label}`
        },
        transaction
      });

      await db.GameActivity.create({
        userId,
        gameId: game.id,
        activityType: 'withdraw',
        amount: win.eligible,
        operationDoneBy: 'bot'
      }, { transaction });
    });

    return {
      success: true,
      message: creditedAmount === Number(amount)
        ? `${creditedAmount} SC withdrawn successfully and added to your wallet.`
        : `${creditedAmount} SC withdrawn successfully and added to your wallet (requested ${Number(amount)} SC).`
    };
  } catch (error) {
    const playerInGameMsg =
      getPlayerInGameBlockedMessage(error) ||
      getGoldenDragonDrawerBlockedMessage(error) ||
      getNoWinningsAvailableToRedeemMessage(error) ||
      (error.isUserInGame ? error.message : null);
    if (playerInGameMsg) {
      const err = new Error(playerInGameMsg);
      err.statusCode = 400;
      err.isUserActionRequired = true;
      if (error.isNoWinningsAvailable) err.isNoWinningsAvailable = true;
      throw err;
    }
    const balanceInfo = getBotBalanceErrorInfo(error);
    if (balanceInfo.isBalanceError || error.isUserBalanceError) {
      const err = new Error(
        'Your game balance is insufficient for the requested amount. Please enter an amount up to your available balance.'
      );
      err.statusCode = 400;
      throw err;
    }
    if (isBotApiFailure(error) && game) {
      try {
        const failUser = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });
        await db.sequelize.transaction(async (transaction) => {
          await db.GameManualRequest.create({
            userId,
            gameId: game.id,
            requestType: 'redeem',
            amount,
            status: 'pending',
            storeCode: failUser?.storeCode || null,
            distributorCode: failUser?.distributorCode || null
          }, { transaction });
        });
        recordBotAutomationFailure({
          gameId: game.id,
          platformUserId: userId,
          storeCode: failUser?.storeCode,
          gameName: game.name,
          error,
          gameUsername: userGameAccount?.botUsername,
          operationType: 'withdrawal'
        }).catch(() => { });
        notifyAdminsManualRequestQueued({
          gameId: game.id,
          requestType: 'redeem',
          amount,
          userId,
          distributorCode: failUser?.distributorCode || null
        }).catch(() => { });
        return {
          success: true,
          pending: true,
          message: `Withdrawal of ${amount} SC submitted. Funds will be in your wallet shortly.`
        };
      } catch (innerErr) {
        throw innerErr;
      }
    }
    throw error;
  }
}

module.exports = { withdrawGameAccount };
