'use strict';

const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { Op } = require('sequelize');
const {
  withBotRetry,
  getBotBalanceErrorInfo,
  isBotApiFailure,
  isRecordableBotAutomationFailure,
  isPlatformSideValidationError,
  getDepositBlockedByProgramSelectionMessage,
  getPlayerInGameBlockedMessage,
  getGoldenDragonDrawerBlockedMessage,
  getNoWinningsAvailableToRedeemMessage,
  captureBotApiResponse,
  extractMessageFromBotResponse
} = require('../../utils/botApiHelper');
const { trySendGameBalanceAlert } = require('./gameBalanceAlert.service');
const { recordBotAutomationFailure } = require('./recordBotAutomationFailure.service');
const { notifyAdminsManualRequestQueued } = require('./notifyManualRequestQueued.service');
const { refreshGameBotApiKey } = require('./addGame.service');
const { getGameBalance } = require('./balance.service');
const { REDEEMABLE_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { recordRscWin } = require('../wallet/scLedger.service');
const { classifyProduct, winEventForProduct } = require('../wallet/scProduct.service');

const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const { assertGameWithdrawAmount } = require('../../utils/integerScGame.helpers');
const { assertUserCanPlayGames } = require('./gamePlayEligibility.service');
const { isGameVaultGame, callGameVaultWithdraw, generateGameVaultOrderId, withGameVaultProviderUserIdRetry } = require('./gamevault.helpers');
const { isVegasXGame, callVegasXCashierCreditsAction, withVegasXCashierTokenRetry } = require('./vegasx.helpers');
const { isOrionStarsTerminalGame, redeemOrionStarsUser } = require('./orionstars.helpers');
const { isFirekirinTerminalGame, redeemFirekirinUser } = require('./firekirin.helpers');
const { isMilkywayTerminalGame, redeemMilkywayUser } = require('./milkyway.helpers');
const { isGameroomAgentGame, redeemGameroomUser, withGameroomProviderUserIdRetry } = require('./gameroom.helpers');
const { isCashmachineAgentGame, redeemCashmachineUser, withCashmachineProviderUserIdRetry } = require('./cashmachine.helpers');
const { isMafiaAgentGame, redeemMafiaUser, withMafiaProviderUserIdRetry } = require('./mafia.helpers');
const {
  isOrionStarsBotAutomationGame,
  isFirekirinBotAutomationGame,
  isMilkywayBotAutomationGame,
  isGameroomBotAutomationGame,
  isCashmachineBotAutomationGame
} = require('../../utils/gameIntegration.helpers');
const { GAME_REDEEM_PENDING } = require('../../constants/gameUserFacingMessages');
const { getRedeemPercentageValue } = require('./getRedeemPercentage.service');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;

/** Game names that use third-party fast/user/withdrawal API (VBLink / UltraPanda / Egame99). */
const VBLINK_ULTRAPANDA_NAMES = ['Vblink', 'UltraPanda', 'Egame99'];

function isVblinkOrUltrapanda(gameName) {
  const name = String(gameName || '').trim();
  return VBLINK_ULTRAPANDA_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

const { isGoldenDragonGame, resolveGoldenDragonCustomerId } = require('./goldenDragon.helpers');
/** Generate sign for VBLink/UltraPanda: MD5(sorted key=value string + appSecret). */
function generateVblinkSign(data, appSecret) {
  const sortedKeys = Object.keys(data).sort();
  const queryString = sortedKeys.map((key) => `${key}=${data[key]}`).join('&');
  const finalString = queryString + appSecret;
  return crypto.createHash('md5').update(finalString, 'utf8').digest('hex');
}

/**
 * Find a game by numeric ID or by name (case-insensitive).
 * Supports both the new RESTful routes (pass game.id) and legacy routes (pass gameName string).
 */
function isThirdPartyApiGame(gameOrName) {
  const gameRef = gameOrName && typeof gameOrName === 'object' ? gameOrName : { name: gameOrName };
  return isVblinkOrUltrapanda(gameRef.name) || isGameVaultGame(gameRef) || isVegasXGame(gameRef);
}

async function findGame(gameId) {
  const attrs = [
    'id', 'name', 'gameKey', 'gameTemplateId', 'botApiUrl', 'botApiKey', 'streamlitToken',
    'botUsername', 'botPassword', 'isActive', 'botOffline', 'manualRedeemOnly', 'appId', 'appSecret', 'agentId', 'apiSecretKey'
  ];
  if (!isNaN(gameId) && Number(gameId) > 0) {
    const game = await db.Game.findByPk(Number(gameId), { attributes: attrs });
    if (game) return game;
  }
  if (typeof gameId === 'string' && gameId.trim()) {
    return db.Game.findOne({
      where: db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.col('name')),
        Op.eq,
        gameId.trim().toLowerCase()
      ),
      attributes: attrs
    });
  }
  return null;
}

/**
 * Call the game bot's redeem API.
 */
async function callBotRedeem(baseUrl, apiKey, accountName, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/redeem`;

  const res = await axios.post(url, { username: accountName, amount }, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log(res.data);
  const data = res.data;
  if (res.status !== 200 || !data || data.success !== true) {
    const err = new Error('Redeem could not be processed at this time. Please try again later.');
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
}

/**
 * Golden Dragon redeem API:
 * POST {baseUrl}/redeem with body { customer_id, amount }.
 * customer_id must be the user's pin_id (stored in user_game_accounts.botPassword).
 */
async function callGoldenDragonRedeem(baseUrl, apiKey, customerId, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/redeem`;
  const body = { customer_id: customerId, amount };

  const res = await axios.post(url, body, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('golden dragon redeem body', body);
  console.log('response data', res.data);
  const data = res.data;
  if (res.status !== 200 || !data || data.success !== true) {
    const providerMsg = extractMessageFromBotResponse(data) || '';
    const noWinnings =
      /no winnings? available to redeem/i.test(providerMsg)
      || (/no winnings?/i.test(providerMsg) && /redeem/i.test(providerMsg))
      || (/winnings?/i.test(providerMsg) && /not available/i.test(providerMsg) && /redeem/i.test(providerMsg));
    if (noWinnings) {
      const err = new Error('No winnings available to redeem');
      err.statusCode = 400;
      err.isNoWinningsAvailable = true;
      err.isUserActionRequired = true;
      err.externalResponse = captureBotApiResponse(data, res.status);
      throw err;
    }
    const err = new Error('Redeem could not be processed at this time. Please try again later.');
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  const providerAmount = Number(data && data.data && data.data.amount);
  const processedAmount = Number.isFinite(providerAmount) ? providerAmount : Number(amount);
  if (!(processedAmount > 0)) {
    const err = new Error('Redeem succeeded but provider returned an invalid amount.');
    err.statusCode = 502;
    err.externalResponse = data;
    throw err;
  }
  return { processedAmount };
}

/**
 * Call VBLink/UltraPanda third-party API: POST {baseUrl}/fast/user/withdrawal
 * Body: application/x-www-form-urlencoded with requestid, appid, timestamp, sign, account, amount.
 * requestid = "WDR" + Date.now(); sign = MD5(sorted key=value string + appSecret).
 */
async function callVblinkUltrapandaWithdrawal(baseUrl, appId, appSecret, account, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/fast/user/withdrawal`;
  const requestid = `WDR${Date.now()}`;
  const timestamp = Date.now().toString();
  const amountStr = String(amount);

  const data = {
    requestid,
    appid: appId,
    timestamp,
    account,
    amount: amountStr
  };
  data.sign = generateVblinkSign(data, appSecret);

  const body = new URLSearchParams(data).toString();

  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('response data', res.data);
  const response = res.data;
  const code = response && (response.code ?? response.Code);

  if (res.status !== 200) {
    const err = new Error('Redeem could not be processed at this time. Please try again later.');
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = response;
    throw err;
  }

  if (code === 200) {
    return;
  }

  const codeMessages = {
    1: 'New user is created',
    2: 'User does not exist',
    3: 'Parameter error',
    4: 'Invalid signature',
    5: 'Agent ban',
    6: 'Account length error',
    7: 'Account format error',
    8: 'Password length error',
    9: 'Password format error',
    10: 'Request ID already used',
    11: 'Unknown database error',
    12: 'User already exist',
    13: 'Top up fail',
    14: 'Insufficient credit',
    15: 'Withdrawal failed',
    16: 'Get balance failed',
    17: 'Operations not allowed in the game',
    18: 'System under maintenance',
    19: 'Requested address does not exist',
    20: 'Password error',
    21: 'Agent name or password error',
    22: 'Platform not configured'
  };
  const message = codeMessages[code] || `Provider error (code ${code})`;
  const err = new Error(`Redeem failed: ${message}`);
  err.statusCode = 502;
  err.externalResponse = response;
  throw err;
}

/**
 * Redeem funds from a game account back into the user's wallet.
 *
 * - If the game's bot is online: calls bot API to redeem, then credits the wallet.
 * - If the game's bot is offline: creates a manual request. The store partner / admin
 *   will process the game-side redemption manually, and the wallet is credited only
 *   after they approve the request.
 *
 * @param {number} userId
 * @param {number|string} gameId - game primary key or game name (legacy routes)
 * @param {number} amount
 */
/**
 * Blocks a second manual redeem request for the same game while one is still pending.
 * Runs inside the caller transaction and locks matching rows to guard against races
 * from two concurrent redeem submissions.
 */
async function assertNoPendingRedeemRequest(userId, gameId, transaction) {
  const existing = await db.GameManualRequest.findOne({
    where: { userId, gameId, requestType: 'redeem', status: 'pending' },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (existing) {
    const err = new Error('A redeem request for this game is already pending. Please wait a few minutes.');
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
}

async function queueRedeemManualRequest({
  userId,
  game,
  amount,
  userGameAccount,
  error,
  recordFailure
}) {
  let storeCode = null;
  let distributorCode = null;
  await db.sequelize.transaction(async (transaction) => {
    await assertNoPendingRedeemRequest(userId, game.id, transaction);
    const user = await db.User.findByPk(userId, {
      attributes: ['storeCode', 'distributorCode'],
      transaction
    });
    storeCode = user?.storeCode || null;
    distributorCode = user?.distributorCode || null;
    await db.GameManualRequest.create({
      userId,
      gameId: game.id,
      requestType: 'redeem',
      amount,
      status: 'pending',
      storeCode,
      distributorCode
    }, { transaction });
  });

  if (recordFailure) {
    recordBotAutomationFailure({
      gameId: game.id,
      platformUserId: userId,
      storeCode,
      gameName: game.name,
      error,
      gameUsername: userGameAccount?.botUsername,
      operationType: 'redeem'
    }).catch(() => { });
  }
  notifyAdminsManualRequestQueued({
    gameId: game.id,
    requestType: 'redeem',
    amount,
    userId,
    distributorCode
  }).catch(() => { });

  return {
    success: true,
    pending: true,
    status: 200,
    message: GAME_REDEEM_PENDING
  };
}

async function redeemGameAccount(userId, gameId, amount) {
  await assertUserCanPlayGames(userId);

  let userGameAccount = null;
  let creditedAmount = Number(amount);
  let game = null;

  try {
    game = await findGame(gameId);

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

    // Reads and provider balance checks happen outside any long-lived DB transaction.
    userGameAccount = await db.UserGameAccount.findOne({
      where: { userId, gameId: game.id }
    });

    if (!userGameAccount) {
      const countForUser = await db.UserGameAccount.count({
        where: { userId }
      });
      console.warn('[redeem] No UserGameAccount found', {
        userId,
        gameIdInput: gameId,
        resolvedGameId: game.id,
        resolvedGameName: game.name,
        userTotalGameAccounts: countForUser
      });
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

    const user = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });

    // Manual mode: queue redeem immediately — do not call provider balance (hangs when bot is down).
    if (game.botOffline || game.manualRedeemOnly) {
      await db.sequelize.transaction(async (transaction) => {
        await assertNoPendingRedeemRequest(userId, game.id, transaction);
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
        status: 200,
        message: GAME_REDEEM_PENDING
      };
    }

    const isGoldenDragonEarly = isGoldenDragonGame(game.name, game.gameKey);

    // Golden Dragon: only winnings are redeemable (entries are playable, not withdrawable).
    if (isGoldenDragonEarly) {
      const gdBalance = await getGameBalance(userId, game.id);
      const winningsSc = Number(gdBalance?.winnings);
      if (!Number.isFinite(winningsSc) || winningsSc <= 0) {
        const err = new Error('No winnings available to redeem');
        err.statusCode = 400;
        err.isNoWinningsAvailable = true;
        err.isUserActionRequired = true;
        err.internalValidation = true;
        throw err;
      }
      if (Number(amount) > winningsSc) {
        const err = new Error(
          `Your game balance is insufficient for the requested amount. Please enter an amount up to your available balance.`
        );
        err.statusCode = 400;
        err.isUserBalanceError = true;
        err.internalValidation = true;
        throw err;
      }
    }

    const percentage = await getRedeemPercentageValue({
      storeCode: user?.storeCode || null,
      distributorCode: user?.distributorCode || null
    });

    const lastTopup = await db.GameActivity.findOne({
      where: {
        userId,
        gameId: game.id,
        activityType: 'topup'
      },
      attributes: ['amount'],
      order: [['createdAt', 'DESC']]
    });

    const lastDepositAmount = lastTopup ? Number(lastTopup.amount) || 0 : 0;

    if (lastDepositAmount > 0) {
      const threshold = lastDepositAmount * (1 + (percentage / 100));
      const balanceRes = await getGameBalance(userId, game.id);
      const currentBalance = isGoldenDragonEarly
        ? (Number(balanceRes.winnings) || 0)
        : (Number(balanceRes.balance) || 0);

      if (currentBalance < threshold) {
        const err = new Error(
          `Minimum balance required to redeem is ${threshold.toFixed(2)} SC (Last deposit + ${percentage}%). Your current balance is ${currentBalance.toFixed(2)} SC.`
        );
        err.statusCode = 400;
        err.internalValidation = true;
        throw err;
      }
    }

    // --- BOT ONLINE path continues below ---
    // (offline / manualRedeemOnly handled above)
    const isVblinkUltrapanda = isVblinkOrUltrapanda(game.name);
    const isGoldenDragon = isGoldenDragonGame(game.name, game.gameKey);
    const isGameVault = isGameVaultGame(game);
    const isVegasXCashier = isVegasXGame(game);
    const isOrionStars = isOrionStarsTerminalGame(game) && !isOrionStarsBotAutomationGame(game);
    const isFirekirinAgent = isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game);
    const isMilkywayAgent = isMilkywayTerminalGame(game) && !isMilkywayBotAutomationGame(game);
    const isGameroomAgent = isGameroomAgentGame(game) && !isGameroomBotAutomationGame(game);
    const isCashmachineAgent = isCashmachineAgentGame(game) && !isCashmachineBotAutomationGame(game);
    const isMafiaAgent = isMafiaAgentGame(game);
    const redeemLogContext = buildBotLogContext({
      game,
      operation: 'redeem',
      storeCode: user?.storeCode,
      gameUsername: userGameAccount.botUsername,
      apiEndpoint: (isOrionStars || isFirekirinAgent || isMilkywayAgent)
        ? '/ws/service.ashx?action=redeem'
        : (isVegasXCashier
          ? '/cashier/user/{id}/credits-action'
          : ((isGameroomAgent || isCashmachineAgent || isMafiaAgent)
            ? '/api/player/playerWithdraw'
            : (isGameVault ? '/api/external/withdraw' : '/redeem')))
    });

    if (isGameVault) {
      const agentId = String(game.agentId || '').trim();
      const apiSecretKey = String(game.apiSecretKey || '').trim();
      if (!agentId || !apiSecretKey) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
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
          { retryOnTimeout: false, logContext: redeemLogContext }
        )
      });
      const providerAmount = Number(withdrawResult && withdrawResult.amount);
      if (Number.isFinite(providerAmount) && providerAmount > 0) {
        creditedAmount = providerAmount;
      }
    } else if (isVblinkUltrapanda) {
      if (!game.botApiUrl || !game.appId || !game.appSecret) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => callVblinkUltrapandaWithdrawal(
          game.botApiUrl,
          game.appId,
          game.appSecret,
          userGameAccount.botUsername,
          amount
        ),
        { retryOnTimeout: false, logContext: redeemLogContext }
      );
    } else if (isGoldenDragon) {
      if (!game.botApiUrl || !game.botApiKey) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      const onInvalidApiKey = async () => {
        const r = await refreshGameBotApiKey(game.id);
        game.botApiKey = r.api_key;
      };
      const customerId = await withBotRetry(
        async () => {
          const id = await resolveGoldenDragonCustomerId(userGameAccount, game);
          if (!id) {
            const err = new Error('Your Golden Dragon account is missing pin_id. Please register the game account again.');
            err.statusCode = 400;
            throw err;
          }
          return id;
        },
        { onInvalidApiKey, logContext: redeemLogContext }
      );
      const redeemResult = await withBotRetry(
        () => callGoldenDragonRedeem(game.botApiUrl, game.botApiKey, customerId, amount),
        { retryOnTimeout: false, onInvalidApiKey, logContext: redeemLogContext }
      );
      creditedAmount = Number(redeemResult.processedAmount);
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
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
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
        { retryOnTimeout: false, logContext: redeemLogContext }
      );
    } else if (isOrionStars) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => redeemOrionStarsUser(game, userGameAccount.botUsername, amount, { callBotRedeem }),
        { retryOnTimeout: false, logContext: redeemLogContext }
      );
    } else if (isFirekirinAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => redeemFirekirinUser(game, userGameAccount.botUsername, amount),
        { retryOnTimeout: false, logContext: redeemLogContext }
      );
    } else if (isMilkywayAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => redeemMilkywayUser(game, userGameAccount.botUsername, amount),
        { retryOnTimeout: false, logContext: redeemLogContext }
      );
    } else if (isGameroomAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withGameroomProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => redeemGameroomUser(game, providerUserId, amount, 'redeem'),
          { retryOnTimeout: false, logContext: redeemLogContext }
        )
      });
    } else if (isCashmachineAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withCashmachineProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => redeemCashmachineUser(game, providerUserId, amount, 'redeem'),
          { retryOnTimeout: false, logContext: redeemLogContext }
        )
      });
    } else if (isMafiaAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withMafiaProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => redeemMafiaUser(game, providerUserId, amount, 'redeem'),
          { retryOnTimeout: false, logContext: redeemLogContext }
        )
      });
    } else {
      if (!game.botApiUrl || !game.botApiKey) {
        const err = new Error('This game is not available for redemptions at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      const onInvalidApiKey = async () => {
        const r = await refreshGameBotApiKey(game.id);
        game.botApiKey = r.api_key;
      };
      await withBotRetry(
        () => callBotRedeem(game.botApiUrl, game.botApiKey, userGameAccount.botUsername, amount),
        { retryOnTimeout: false, onInvalidApiKey, logContext: redeemLogContext }
      );
    }

    // Short TX: credit wallet only after bot success.
    await db.sequelize.transaction(async (transaction) => {
      const product = classifyProduct(game);
      const win = await recordRscWin({
        userId,
        grossAmount: creditedAmount,
        creditWallet: true,
        ledger: {
          eventType: winEventForProduct(product.productId),
          sourceType: 'GAME_REDEEM',
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
        activityType: 'redeem',
        amount: win.eligible,
        operationDoneBy: 'bot'
      }, { transaction });

      if (db.UserTransaction) {
        await db.UserTransaction.create({
          userId,
          type: 'game_withdraw',
          amount: win.eligible,
          currencyCode: REDEEMABLE_CURRENCY_CODE,
          description: `${win.eligible} SC redeemed from game account`,
          metadata: { game_name: game.name, gross_amount: creditedAmount, voided_amount: win.voided }
        }, { transaction });
      }
    });

    return {
      success: true,
      message: creditedAmount === Number(amount)
        ? `${creditedAmount} SC redeemed successfully and added to your wallet.`
        : `${creditedAmount} SC redeemed successfully and added to your wallet (requested ${Number(amount)} SC).`,
      status: 200,
      data: null
    };
  } catch (error) {
    const blockedMsg =
      getDepositBlockedByProgramSelectionMessage(error) ||
      getPlayerInGameBlockedMessage(error) ||
      getGoldenDragonDrawerBlockedMessage(error) ||
      getNoWinningsAvailableToRedeemMessage(error) ||
      (error.isUserInGame ? error.message : null);
    if (blockedMsg) {
      const err = new Error(blockedMsg);
      err.statusCode = 400;
      err.isUserActionRequired = true;
      if (error.isNoWinningsAvailable) err.isNoWinningsAvailable = true;
      throw err;
    }
    const balanceInfo = getBotBalanceErrorInfo(error);
    if (balanceInfo.isBalanceError || error.isUserBalanceError) {
      if (game && !isThirdPartyApiGame(game)) {
        trySendGameBalanceAlert({
          gameId: game.id,
          gameName: game.name,
          operation: 'Redeem',
          amount,
          botMessage: balanceInfo.message
        }).catch(() => { });
      }
      if (game && isThirdPartyApiGame(game)) {
        throw error;
      }
      const err = new Error(
        'Your game balance is insufficient for the requested amount. Please enter an amount up to your available balance.'
      );
      err.statusCode = 400;
      throw err;
    }
    if (isBotApiFailure(error) && game) {
      try {
        return await queueRedeemManualRequest({
          userId,
          game,
          amount,
          userGameAccount,
          error,
          recordFailure: true
        });
      } catch (innerErr) {
        throw innerErr;
      }
    }
    if (isPlatformSideValidationError(error)) {
      throw error;
    }
    try {
      const gameForRecord = game || await findGame(gameId);
      if (gameForRecord && isRecordableBotAutomationFailure(error) && !isBotApiFailure(error)) {
        const userForRecord = await db.User.findByPk(userId, { attributes: ['storeCode'] });
        await recordBotAutomationFailure({
          gameId: gameForRecord.id,
          platformUserId: userId,
          storeCode: userForRecord?.storeCode,
          gameName: gameForRecord.name,
          error,
          gameUsername: userGameAccount?.botUsername,
          operationType: 'redeem'
        }).catch(() => { });
      }
    } catch {
      // ignore secondary recording errors
    }
    throw error;
  }
}

module.exports = { redeemGameAccount };
