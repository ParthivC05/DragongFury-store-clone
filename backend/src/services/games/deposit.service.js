'use strict';

const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { Op } = require('sequelize');
const {
  withBotRetry,
  getBotBalanceErrorInfo,
  isAgentSideBalanceError,
  isBotApiFailure,
  isRecordableBotAutomationFailure,
  isPlatformSideValidationError,
  getDepositBlockedByProgramSelectionMessage,
  getPlayerInGameBlockedMessage,
  getGoldenDragonDrawerBlockedMessage,
  captureBotApiResponse
} = require('../../utils/botApiHelper');
const { trySendGameBalanceAlert } = require('./gameBalanceAlert.service');
const { recordBotAutomationFailure } = require('./recordBotAutomationFailure.service');
const { notifyAdminsManualRequestQueued } = require('./notifyManualRequestQueued.service');
const { refreshGameBotApiKey } = require('./addGame.service');
const { getCurrencySetting } = require('../wallet/getCurrencySetting.service');
const {
  deductPlayable,
  freezePlayable,
  releaseFrozenPlayable,
  captureFrozenPlayable,
  refundPlayable,
  buildDepositFundingNotes
} = require('../wallet/walletBuckets.service');
const { classifyProduct, usedEventForProduct } = require('../wallet/scProduct.service');
const { invalidateBalanceCache } = require('../wallet/balanceCache');
const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');

const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { isAbortedTransactionError } = require('../../utils/pgErrors');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const { assertGameDepositAmount, assertGameDepositLimits } = require('../../utils/integerScGame.helpers');
const {
  resolveDepositDiscountPercent,
  computeGameDepositCredit,
  buildDepositRequestNotes,
  buildGameDepositActivityMetadata
} = require('../../utils/depositDiscount.helpers');
const { assertUserCanPlayGames } = require('./gamePlayEligibility.service');
const { isGameVaultGame, callGameVaultRecharge, generateGameVaultOrderId, withGameVaultProviderUserIdRetry } = require('./gamevault.helpers');
const { isVegasXGame, callVegasXCashierCreditsAction, withVegasXCashierTokenRetry } = require('./vegasx.helpers');
const { isOrionStarsTerminalGame, rechargeOrionStarsUser } = require('./orionstars.helpers');
const { isFirekirinTerminalGame, rechargeFirekirinUser } = require('./firekirin.helpers');
const { isMilkywayTerminalGame, rechargeMilkywayUser } = require('./milkyway.helpers');
const { isGameroomAgentGame, rechargeGameroomUser, withGameroomProviderUserIdRetry } = require('./gameroom.helpers');
const { isCashmachineAgentGame, rechargeCashmachineUser, withCashmachineProviderUserIdRetry } = require('./cashmachine.helpers');
const { isMafiaAgentGame, rechargeMafiaUser, withMafiaProviderUserIdRetry } = require('./mafia.helpers');
const {
  isOrionStarsBotAutomationGame,
  isFirekirinBotAutomationGame,
  isMilkywayGame,
  isMilkywayBotAutomationGame,
  isGameroomBotAutomationGame,
  isCashmachineBotAutomationGame,
  isJuwaFamilyGame,
  isJuwa20FamilyGame,
  isPandamasterFamilyGame,
  isCustomManualGame,
  isGameVaultFamilyGame,
  isOrionStarsGame,
  isFirekirinGame,
  isGameroomGame,
  isCashmachineGame,
  isMafiaGame,
  compactGameKey
} = require('../../utils/gameIntegration.helpers');
const { isGoldenDragonGame, resolveGoldenDragonCustomerId } = require('./goldenDragon.helpers');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;

/** Game names that use third-party fast/user/deposit API (VBLink / UltraPanda / Egame99). */
const VBLINK_ULTRAPANDA_NAMES = ['Vblink', 'UltraPanda', 'Egame99'];

function isVblinkOrUltrapanda(gameName) {
  const name = String(gameName || '').trim();
  return VBLINK_ULTRAPANDA_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

/**
 * Platform bot/agent games use freeze-first top-ups.
 * Custom/manual-only games keep the legacy deduct-first path.
 */
function isPlatformGameDepositFreeze(game) {
  if (!game || isCustomManualGame(game)) return false;
  const key = compactGameKey(game.gameKey);
  const name = compactGameKey(game.name);
  if (isVblinkOrUltrapanda(game.name)) return true;
  if (isGoldenDragonGame(game.name, game.gameKey)) return true;
  if (isGameVaultGame(game) || isGameVaultFamilyGame(game)) return true;
  if (isVegasXGame(game)) return true;
  if (isOrionStarsGame(game) || isOrionStarsTerminalGame(game) || isOrionStarsBotAutomationGame(game)) return true;
  if (isFirekirinGame(game) || isFirekirinTerminalGame(game) || isFirekirinBotAutomationGame(game)) return true;
  if (isMilkywayGame(game) || isMilkywayTerminalGame(game) || isMilkywayBotAutomationGame(game)) return true;
  if (isGameroomGame(game) || isGameroomAgentGame(game) || isGameroomBotAutomationGame(game)) return true;
  if (isCashmachineGame(game) || isCashmachineAgentGame(game) || isCashmachineBotAutomationGame(game)) return true;
  if (isMafiaGame(game) || isMafiaAgentGame(game)) return true;
  if (isJuwaFamilyGame(game) || isJuwa20FamilyGame(game)) return true;
  if (isPandamasterFamilyGame(game)) return true;
  if (game.botApiUrl || game.agentId || game.appId) return true;
  return false;
}

function buildUsedLedgerMeta(game, product) {
  return {
    eventType: usedEventForProduct(product.productId),
    sourceType: 'GAME_DEPOSIT',
    sourceId: game.id,
    productId: product.productId,
    productType: product.productType,
    providerId: product.providerId,
    gameId: product.gameId,
    remarks: `Used on ${product.label}`
  };
}

function bumpBalanceCaches(userId) {
  try {
    invalidateBalanceCache(userId);
  } catch (_) { /* ignore */ }
  try {
    notifyUserBalanceChanged(userId);
  } catch (_) { /* ignore */ }
}

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
    'botUsername', 'botPassword', 'isActive', 'botOffline', 'appId', 'appSecret', 'agentId', 'apiSecretKey',
    'minDepositLimit', 'maxDepositLimit', 'depositDiscountPercent', 'addedByStoreCode'
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
 * Call the game bot's deposit API.
 */
async function callBotDeposit(baseUrl, apiKey, accountName, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/deposit`;

  const res = await axios.post(url, { username: accountName, amount }, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log(res.data);
  const data = res.data;
  if (res.status !== 200 || !data || data.success !== true) {
    const err = new Error('Deposit could not be processed at this time. Please try again later.');
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
}

/**
 * Golden Dragon top-up API:
 * POST {baseUrl}/deposit with X-API-Key and body { customer_id, amount }.
 * customer_id must use pin_id (currently stored in user_game_accounts.botPassword).
 */
async function callGoldenDragonDeposit(baseUrl, apiKey, customerId, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/deposit`;
  const body = { customer_id: customerId, amount };
  const res = await axios.post(url, body, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('golden dragon deposit body', body);
  console.log(res.data);
  const data = res.data;
  if (res.status !== 200 || !data || data.success !== true) {
    const err = new Error('Deposit could not be processed at this time. Please try again later.');
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
}

/**
 * Call VBLink/UltraPanda third-party API: POST {baseUrl}/fast/user/deposit
 * Body: application/x-www-form-urlencoded with requestid, appid, timestamp, sign, account, amount.
 * requestid = "DEP" + Date.now(); sign = MD5(sorted key=value string + appSecret).
 */
async function callVblinkUltrapandaDeposit(baseUrl, appId, appSecret, account, amount) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/fast/user/deposit`;
  const requestid = `DEP${Date.now()}`;
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
    const err = new Error('Deposit could not be processed at this time. Please try again later.');
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
  const err = new Error(`Deposit failed: ${message}`);
  err.statusCode = 502;
  err.externalResponse = response;
  throw err;
}

const {
  GAME_DEPOSIT_PENDING
} = require('../../constants/gameUserFacingMessages');

const DEPOSIT_PENDING_MESSAGE = GAME_DEPOSIT_PENDING;

/** Refund a previously committed top-up reservation (PSC → BSC → RSC). */
async function refundReservedDeposit(userId, funding, game = null) {
  const product = classifyProduct(game);
  await refundPlayable(userId, funding, null, {
    sourceType: 'GAME_DEPOSIT_REFUND',
    sourceId: game?.id || null,
    productId: product.productId,
    productType: product.productType,
    providerId: product.providerId,
    gameId: product.gameId,
    eventType: 'REFUND',
    remarks: game?.name ? `Refund game deposit: ${game.name}` : 'Refund game deposit'
  });
  bumpBalanceCaches(userId);
}

/** Undo a freeze-only reservation (money never left balance, only frozen). */
async function releaseFrozenReservation(userId, funding) {
  await releaseFrozenPlayable(userId, funding, null);
  bumpBalanceCaches(userId);
}

async function queueDepositManualRequest({
  userId,
  game,
  amount,
  funding,
  discount = null
}) {
  const user = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });
  await db.GameManualRequest.create({
    userId,
    gameId: game.id,
    requestType: 'deposit',
    amount,
    status: 'pending',
    storeCode: user?.storeCode || null,
    distributorCode: user?.distributorCode || null,
    notes: buildDepositRequestNotes(buildDepositFundingNotes(funding), discount)
  });
  notifyAdminsManualRequestQueued({
    gameId: game.id,
    requestType: 'deposit',
    amount,
    gameCredit: discount?.gameCredit,
    userId,
    distributorCode: user?.distributorCode || null
  }).catch(() => { });
  return {
    success: true,
    pending: true,
    status: 200,
    message: DEPOSIT_PENDING_MESSAGE
  };
}

/**
 * Failure path for freeze-first platform games:
 * capture frozen SC (spend it) + queue manual for store admin.
 */
async function captureFrozenAndQueueManual({
  userId,
  game,
  amount,
  funding,
  discount = null
}) {
  const product = classifyProduct(game);
  let distributorCode = null;
  await db.sequelize.transaction(async (transaction) => {
    await captureFrozenPlayable(userId, funding, transaction, buildUsedLedgerMeta(game, product));
    const user = await db.User.findByPk(userId, {
      attributes: ['storeCode', 'distributorCode'],
      transaction
    });
    distributorCode = user?.distributorCode || null;
    await db.GameManualRequest.create({
      userId,
      gameId: game.id,
      requestType: 'deposit',
      amount,
      status: 'pending',
      storeCode: user?.storeCode || null,
      distributorCode,
      notes: buildDepositRequestNotes(buildDepositFundingNotes(funding), discount)
    }, { transaction });
  });
  bumpBalanceCaches(userId);
  notifyAdminsManualRequestQueued({
    gameId: game.id,
    requestType: 'deposit',
    amount,
    gameCredit: discount?.gameCredit,
    userId,
    distributorCode
  }).catch(() => { });
  return {
    success: true,
    pending: true,
    status: 200,
    message: DEPOSIT_PENDING_MESSAGE
  };
}

/**
 * Deposit funds from the user's wallet into their game account.
 *
 * Platform bot/agent games (VBLink, Firekirin, Milkyway, Golden Dragon, etc.):
 *   1) freeze SC
 *   2) bot success → capture freeze (debit) + wallet activity
 *   3) bot failure → capture freeze + manual request (admin reject refunds)
 *
 * Other / custom games keep deduct-first behavior.
 *
 * DB transactions never stay open across bot/provider HTTP calls (avoids idle-in-transaction).
 *
 * @param {number} userId
 * @param {number|string} gameId - game primary key or game name (legacy routes)
 * @param {number} amount
 */
async function depositGameAccount(userId, gameId, amount) {
  await assertUserCanPlayGames(userId);
  assertGameDepositAmount(amount);

  const displayCurrencyCode = await getCurrencySetting();
  let userGameAccount = null;
  let funding = { psc: 0, bsc: 0, rsc: 0 };
  let fundsReserved = false;
  /** Freeze-first path: funds held in frozenBalance until capture/release. */
  let useFreezeFlow = false;
  let fundsFrozen = false;
  let fundsCaptured = false;
  /** Once the provider confirms top-up, never auto-refund — game already has the SC. */
  let botCompleted = false;
  let game = null;
  let gameCredit = amount;
  let discount = null;

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

    assertGameDepositLimits(amount, game);
    useFreezeFlow = isPlatformGameDepositFreeze(game);

    const walletAmount = amount;
    const discountPercent = resolveDepositDiscountPercent(game.depositDiscountPercent);
    gameCredit = computeGameDepositCredit(walletAmount, discountPercent);
    discount = discountPercent > 0 && gameCredit > walletAmount
      ? { percent: discountPercent, walletAmount, gameCredit }
      : null;

    userGameAccount = await db.UserGameAccount.findOne({
      where: { userId, gameId: game.id }
    });

    if (!userGameAccount) {
      const err = new Error('You do not have a registered account for this game. Please register first.');
      err.statusCode = 404;
      throw err;
    }

    if (!userGameAccount.botUsername) {
      const err = new Error('Your game account is not fully set up yet. Please wait for it to be activated.');
      err.statusCode = 400;
      throw err;
    }

    // Phase 1: reserve funds in a short DB transaction (no external HTTP inside).
    let pendingManual = false;
    let offlineUser = null;
    await db.sequelize.transaction(async (transaction) => {
      const product = classifyProduct(game);

      if (useFreezeFlow) {
        funding = await freezePlayable(userId, walletAmount, transaction);

        if (game.botOffline) {
          // Offline: capture immediately and queue manual (same end state as failure path).
          await captureFrozenPlayable(userId, funding, transaction, buildUsedLedgerMeta(game, product));
          offlineUser = await db.User.findByPk(userId, {
            attributes: ['storeCode', 'distributorCode'],
            transaction
          });
          await db.GameManualRequest.create({
            userId,
            gameId: game.id,
            requestType: 'deposit',
            amount,
            status: 'pending',
            storeCode: offlineUser?.storeCode || null,
            distributorCode: offlineUser?.distributorCode || null,
            notes: buildDepositRequestNotes(buildDepositFundingNotes(funding), discount)
          }, { transaction });
          pendingManual = true;
        }
      } else {
        funding = await deductPlayable(userId, walletAmount, transaction, buildUsedLedgerMeta(game, product));

        if (game.botOffline) {
          offlineUser = await db.User.findByPk(userId, {
            attributes: ['storeCode', 'distributorCode'],
            transaction
          });
          await db.GameManualRequest.create({
            userId,
            gameId: game.id,
            requestType: 'deposit',
            amount,
            status: 'pending',
            storeCode: offlineUser?.storeCode || null,
            distributorCode: offlineUser?.distributorCode || null,
            notes: buildDepositRequestNotes(buildDepositFundingNotes(funding), discount)
          }, { transaction });
          pendingManual = true;
        }
      }
    });
    fundsReserved = true;
    if (useFreezeFlow) {
      fundsFrozen = true;
      if (pendingManual) {
        fundsCaptured = true;
        fundsFrozen = false;
      }
    }
    bumpBalanceCaches(userId);

    if (pendingManual) {
      notifyAdminsManualRequestQueued({
        gameId: game.id,
        requestType: 'deposit',
        amount,
        gameCredit,
        userId,
        distributorCode: offlineUser?.distributorCode || null
      }).catch(() => { });
      return {
        success: true,
        pending: true,
        status: 200,
        message: DEPOSIT_PENDING_MESSAGE
      };
    }

    // Phase 2: bot/provider HTTP — no open DB transaction.
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
    const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
    const depositLogContext = buildBotLogContext({
      game,
      operation: 'deposit',
      storeCode: user?.storeCode,
      gameUsername: userGameAccount.botUsername,
      apiEndpoint: (isOrionStars || isFirekirinAgent || isMilkywayAgent)
        ? '/ws/service.ashx?action=recharge'
        : (isVegasXCashier
          ? '/cashier/user/{id}/credits-action'
          : ((isGameroomAgent || isCashmachineAgent || isMafiaAgent)
            ? '/api/player/playerRecharge'
            : (isGameVault ? '/api/external/recharge' : '/deposit')))
    });

    if (isGameVault) {
      const agentId = String(game.agentId || '').trim();
      const apiSecretKey = String(game.apiSecretKey || '').trim();
      if (!agentId || !apiSecretKey) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withGameVaultProviderUserIdRetry({
        game,
        userGameAccount,
        agentId,
        apiSecretKey,
        transaction: null,
        operation: (providerUserId) => withBotRetry(
          () => callGameVaultRecharge(
            game,
            agentId,
            apiSecretKey,
            providerUserId,
            gameCredit,
            generateGameVaultOrderId()
          ),
          { retryOnTimeout: false, logContext: depositLogContext }
        )
      });
    } else if (isVblinkUltrapanda) {
      if (!game.botApiUrl || !game.appId || !game.appSecret) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => callVblinkUltrapandaDeposit(
          game.botApiUrl,
          game.appId,
          game.appSecret,
          userGameAccount.botUsername,
          gameCredit
        ),
        { retryOnTimeout: false, logContext: depositLogContext }
      );
    } else if (isGoldenDragon) {
      const goldenDragonApiKey = String(game.botApiKey || '').trim();
      if (!game.botApiUrl || !goldenDragonApiKey) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
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
        { onInvalidApiKey, logContext: depositLogContext }
      );
      await withBotRetry(
        () => callGoldenDragonDeposit(game.botApiUrl, game.botApiKey, customerId, gameCredit),
        { retryOnTimeout: false, onInvalidApiKey, logContext: depositLogContext }
      );
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
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => withVegasXCashierTokenRetry(game, (token) => callVegasXCashierCreditsAction(
          game,
          token,
          providerUserId,
          gameCredit
        )),
        { retryOnTimeout: false, logContext: depositLogContext }
      );
    } else if (isOrionStars) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => rechargeOrionStarsUser(game, userGameAccount.botUsername, gameCredit, { callBotDeposit }),
        { retryOnTimeout: false, logContext: depositLogContext }
      );
    } else if (isFirekirinAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => rechargeFirekirinUser(game, userGameAccount.botUsername, gameCredit),
        { retryOnTimeout: false, logContext: depositLogContext }
      );
    } else if (isMilkywayAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withBotRetry(
        () => rechargeMilkywayUser(game, userGameAccount.botUsername, gameCredit),
        { retryOnTimeout: false, logContext: depositLogContext }
      );
    } else if (isGameroomAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withGameroomProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => rechargeGameroomUser(game, providerUserId, gameCredit, 'deposit'),
          { retryOnTimeout: false, logContext: depositLogContext }
        )
      });
    } else if (isCashmachineAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withCashmachineProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => rechargeCashmachineUser(game, providerUserId, gameCredit, 'deposit'),
          { retryOnTimeout: false, logContext: depositLogContext }
        )
      });
    } else if (isMafiaAgent) {
      if (!game.botUsername || !game.botPassword) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      await withMafiaProviderUserIdRetry({
        game,
        userGameAccount,
        operation: (providerUserId) => withBotRetry(
          () => rechargeMafiaUser(game, providerUserId, gameCredit, 'deposit'),
          { retryOnTimeout: false, logContext: depositLogContext }
        )
      });
    } else {
      if (!game.botApiUrl || !game.botApiKey) {
        const err = new Error('This game is not available for deposits at the moment. Please try again later.');
        err.statusCode = 503;
        throw err;
      }
      const onInvalidApiKey = async () => {
        const r = await refreshGameBotApiKey(game.id);
        game.botApiKey = r.api_key;
      };
      await withBotRetry(
        () => callBotDeposit(game.botApiUrl, game.botApiKey, userGameAccount.botUsername, gameCredit),
        { retryOnTimeout: false, onInvalidApiKey, logContext: depositLogContext }
      );
    }

    botCompleted = true;

    // Phase 3: capture freeze (if needed) + record success.
    const product = classifyProduct(game);
    await db.sequelize.transaction(async (transaction) => {
      if (useFreezeFlow && !fundsCaptured) {
        await captureFrozenPlayable(userId, funding, transaction, buildUsedLedgerMeta(game, product));
      }

      await db.GameActivity.create({
        userId,
        gameId: game.id,
        activityType: 'topup',
        amount: gameCredit,
        metadata: buildGameDepositActivityMetadata({
          walletAmount: amount,
          gameCredit,
          discountPercent: discount ? discount.percent : 0,
          gameName: game.name
        }),
        operationDoneBy: 'bot'
      }, { transaction });

      if (db.UserTransaction) {
        await db.UserTransaction.create({
          userId,
          type: 'game_deposit',
          amount,
          currencyCode: displayCurrencyCode,
          description: discount
            ? `${amount} ${displayCurrencyCode} deposited to game account (${gameCredit} SC credited, ${discount.percent}% extra)`
            : `${amount} ${displayCurrencyCode} deposited to game account`,
          metadata: {
            game_name: game.name,
            funding,
            wallet_amount: amount,
            game_credit: gameCredit,
            deposit_discount_percent: discount ? discount.percent : 0
          }
        }, { transaction });
      }
    });
    if (useFreezeFlow) {
      fundsCaptured = true;
      fundsFrozen = false;
    }
    bumpBalanceCaches(userId);

    try {
      const { tryMarkReferralPlaythroughForUser } = require('../affiliate/markReferralPlaythrough.service');
      await tryMarkReferralPlaythroughForUser(userId);
    } catch (_) {
      /* non-blocking */
    }

    return {
      success: true,
      message: discount
        ? `${gameCredit} SC deposited to your game account successfully (${amount} SC from wallet + ${discount.percent}% extra).`
        : `${amount} SC deposited to your game account successfully.`,
      status: 200,
      data: null
    };
  } catch (error) {
    const canUndoReservation = fundsReserved && !botCompleted && !fundsCaptured;

    const undoReservation = async () => {
      if (!canUndoReservation) return;
      if (useFreezeFlow && fundsFrozen && !fundsCaptured) {
        await releaseFrozenReservation(userId, funding);
        fundsFrozen = false;
      } else if (!useFreezeFlow) {
        await refundReservedDeposit(userId, funding, game);
      }
      fundsReserved = false;
    };

    const queueManualAfterFailure = async () => {
      if (useFreezeFlow && fundsFrozen && !fundsCaptured) {
        const pending = await captureFrozenAndQueueManual({
          userId,
          game,
          amount,
          funding,
          discount
        });
        fundsCaptured = true;
        fundsFrozen = false;
        fundsReserved = false;
        return pending;
      }
      const pending = await queueDepositManualRequest({
        userId,
        game,
        amount,
        funding,
        discount
      });
      fundsReserved = false;
      return pending;
    };

    // Bot succeeded but Phase 3 recording failed: capture + activity, or capture + manual.
    if (botCompleted && useFreezeFlow && fundsFrozen && !fundsCaptured && game) {
      try {
        const product = classifyProduct(game);
        await db.sequelize.transaction(async (transaction) => {
          await captureFrozenPlayable(userId, funding, transaction, buildUsedLedgerMeta(game, product));
          await db.GameActivity.create({
            userId,
            gameId: game.id,
            activityType: 'topup',
            amount,
            operationDoneBy: 'bot'
          }, { transaction });
          if (db.UserTransaction) {
            await db.UserTransaction.create({
              userId,
              type: 'game_deposit',
              amount,
              currencyCode: displayCurrencyCode,
              description: `${amount} ${displayCurrencyCode} deposited to game account`,
              metadata: { game_name: game.name, funding }
            }, { transaction });
          }
        });
        fundsCaptured = true;
        fundsFrozen = false;
        fundsReserved = false;
        bumpBalanceCaches(userId);
        return {
          success: true,
          message: `${amount} SC deposited to your game account successfully.`,
          status: 200,
          data: null
        };
      } catch (_) {
        try {
          const pending = await captureFrozenAndQueueManual({ userId, game, amount, funding, discount });
          fundsCaptured = true;
          fundsFrozen = false;
          fundsReserved = false;
          return pending;
        } catch (__) {
          /* fall through */
        }
      }
    }

    const blockedMsg =
      getDepositBlockedByProgramSelectionMessage(error) ||
      getPlayerInGameBlockedMessage(error) ||
      getGoldenDragonDrawerBlockedMessage(error) ||
      (error.isUserInGame ? error.message : null);
    if (blockedMsg) {
      await undoReservation();
      const err = new Error(blockedMsg);
      err.statusCode = 400;
      err.isUserActionRequired = true;
      throw err;
    }

    if (isAbortedTransactionError(error)) {
      await undoReservation();
      const err = new Error('Deposit could not be processed at this time. Please try again later.');
      err.statusCode = 503;
      err.internalValidation = true;
      throw err;
    }

    const balanceInfo = getBotBalanceErrorInfo(error);
    const agentSideBalance = isAgentSideBalanceError(error);
    if ((balanceInfo.isBalanceError || agentSideBalance) && !botCompleted) {
      // Player/user insufficient on Game Vault / VBLink / VegasX: show error.
      // Agent/provider out of credits: keep funds reserved and queue as manual.
      if (game && isThirdPartyApiGame(game) && !agentSideBalance) {
        await undoReservation();
        throw error;
      }
      if (game && fundsReserved) {
        trySendGameBalanceAlert({
          gameId: game.id,
          gameName: game.name,
          operation: 'Deposit',
          amount: gameCredit,
          botMessage: balanceInfo.message || error.message
        }).catch(() => { });
        try {
          return await queueManualAfterFailure();
        } catch (innerErr) {
          await undoReservation();
          throw innerErr;
        }
      }
    }

    if (isBotApiFailure(error) && game && fundsReserved && !botCompleted) {
      try {
        const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
        recordBotAutomationFailure({
          gameId: game.id,
          platformUserId: userId,
          storeCode: user?.storeCode,
          gameName: game.name,
          error,
          gameUsername: userGameAccount?.botUsername,
          operationType: 'topup'
        }).catch(() => { });
        return await queueManualAfterFailure();
      } catch (innerErr) {
        await undoReservation();
        throw innerErr;
      }
    }

    // Bot already credited the game — do not refund wallet (would double-pay the user).
    if (canUndoReservation) {
      await undoReservation();
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
          operationType: 'topup'
        }).catch(() => { });
      }
    } catch {
      // ignore secondary recording errors
    }

    // Never leave platform-game SC stuck frozen with no manual/refund trail.
    if (useFreezeFlow && fundsFrozen && !fundsCaptured && game) {
      try {
        if (botCompleted) {
          await captureFrozenAndQueueManual({ userId, game, amount, funding, discount });
        } else {
          await releaseFrozenReservation(userId, funding);
        }
        fundsFrozen = false;
        fundsCaptured = botCompleted;
        fundsReserved = false;
      } catch (_) {
        /* ignore secondary settle errors */
      }
    }

    throw error;
  }
}

module.exports = { depositGameAccount, isPlatformGameDepositFreeze };
