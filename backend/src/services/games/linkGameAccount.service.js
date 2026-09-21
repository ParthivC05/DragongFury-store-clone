'use strict';

const axios = require('axios');
const db = require('../../db/models');
const { Op } = require('sequelize');
const { withBotRetry, isBotApiFailure, captureBotApiResponse } = require('../../utils/botApiHelper');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const { refreshGameBotApiKey } = require('./addGame.service');
const { isVblinkOrUltrapanda, callVblinkUltrapandaBalance } = require('./balance.service');
const {
  isAlphanumeric6To20UsernameGame,
  isAlphanumeric5To20UsernameGame,
} = require('../../utils/gameUsernameValidation.helpers');
const {
  isGameVaultGame,
  callGameVaultGetUserId
} = require('./gamevault.helpers');
const {
  isVegasXGame,
  findVegasXCashierUserByName,
  withVegasXCashierTokenRetry
} = require('./vegasx.helpers');
const {
  isFirekirinTerminalGame,
  queryFirekirinUserBalanceWithAgentLogin
} = require('./firekirin.helpers');
const {
  isMilkywayTerminalGame,
  queryMilkywayUserBalanceWithAgentLogin
} = require('./milkyway.helpers');
const {
  isGameroomAgentGame,
  findGameroomPlayerByUsername,
  withGameroomAgentTokenRetry
} = require('./gameroom.helpers');
const {
  isCashmachineAgentGame,
  findCashmachinePlayerByUsername,
  withCashmachineAgentTokenRetry
} = require('./cashmachine.helpers');
const {
  isMafiaAgentGame,
  findMafiaPlayerByUsername,
  withMafiaAgentTokenRetry
} = require('./mafia.helpers');
const {
  isFirekirinBotAutomationGame,
  isMilkywayBotAutomationGame,
  isGameroomBotAutomationGame,
  isCashmachineBotAutomationGame,
  isOrionStarsTerminalGame,
  isOrionStarsBotAutomationGame,
  isOrionStarsGame,
  getStoreGameDisplayName
} = require('../../utils/gameIntegration.helpers');
const {
  queryOrionStarsUserBalanceWithAgentLogin
} = require('./orionstars.helpers');
const {
  assertGameUsernameAvailable,
  isGameUsernameTakenError,
  rethrowGameUsernameConflict
} = require('./assertGameUsernameAvailable.service');
const { GAME_LINK_PENDING, GAME_REQUEST_IN_PROGRESS } = require('../../constants/gameUserFacingMessages');
const {
  isGoldenDragonGame,
  callGoldenDragonSearchUser
} = require('./goldenDragon.helpers');

const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const MIN_LINK_GAME_USERNAME_LENGTH = 6;

/** Shown when search-user confirms the username does not exist on the game (never raw bot errors). */
const SEARCH_USER_NOT_FOUND_MESSAGE =
  'Player not found. Use the same username you use to log in to this game.';

/** Shown when VegasX cashier users list has no matching `users.name`. */
const VEGASX_USER_NOT_FOUND_MESSAGE = 'User not found.';

const LINK_GAME_ATTRS = [
  'id',
  'name',
  'gameKey',
  'botApiUrl',
  'botApiKey',
  'botUsername',
  'botPassword',
  'streamlitToken',
  'gameTemplateId',
  'isActive',
  'botOffline',
  'appId',
  'appSecret',
  'agentId',
  'apiSecretKey',
  'addedByStoreCode'
];

/**
 * True when the search-user API indicates the username does not exist (not a bot outage).
 * These must not trigger manual mode; the user should fix the username and retry.
 * @param {number} httpStatus
 * @param {object|null|undefined} body
 */
function isSearchUserNotFoundResponse(httpStatus, body) {
  if (httpStatus === 404) return true;
  if (!body || typeof body !== 'object' || body.success === true) return false;
  const msg = String(body.message ?? body.detail ?? body.error ?? '')
    .toLowerCase()
    .trim();
  if (!msg) return false;
  const needles = [
    'user not found',
    'username not found',
    'player not found',
    'no user found',
    'unknown user',
    'invalid username',
    'invalid user',
    'user invalid',
    'not found on the game',
    'account not found',
    'user does not exist',
    'username does not exist'
  ];
  return needles.some((n) => msg.includes(n));
}

/**
 * Prefer the same OrionStars row the games list would show when several map to one display name.
 * @param {object[]} candidates
 */
function pickPreferredLinkGame(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let preferred = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const game = candidates[i];
    if (!isOrionStarsGame(game) || !isOrionStarsGame(preferred)) {
      if (Number(game.id) > Number(preferred.id)) preferred = game;
      continue;
    }
    const gameIsBot = isOrionStarsBotAutomationGame(game);
    const preferredIsBot = isOrionStarsBotAutomationGame(preferred);
    if (
      (gameIsBot && !preferredIsBot)
      || (gameIsBot === preferredIsBot && Number(game.id) > Number(preferred.id))
    ) {
      preferred = game;
    }
  }
  return preferred;
}

/**
 * Find an active game by name (case-insensitive), scoped to the user's store.
 * Mirrors the same filter used by the games list endpoint so the found game
 * is always one the user can actually see on their dashboard.
 *
 * The store frontend receives getStoreGameDisplayName() (e.g. "Orionstars" for
 * "OrionStars Agent" / orionstarsagent). Exact name match can miss after an
 * admin bot↔agent switch, so fall back to display-name matching.
 *
 * @param {string} gameName
 * @param {string|null} storeCode - from the user's JWT (null for non-store users)
 */
async function findGameByName(gameName, storeCode) {
  const name = String(gameName || '').trim();
  if (!name) return null;
  const target = name.toLowerCase();
  const scope = { isActive: true, addedByStoreCode: storeCode || null };

  const exact = await db.Game.findOne({
    where: {
      [Op.and]: [
        db.sequelize.where(
          db.sequelize.fn('LOWER', db.sequelize.col('name')),
          Op.eq,
          target
        ),
        scope
      ]
    },
    attributes: LINK_GAME_ATTRS
  });
  if (exact) return exact;

  const scoped = await db.Game.findAll({
    where: scope,
    attributes: LINK_GAME_ATTRS
  });
  const byDisplay = scoped.filter(
    (g) => getStoreGameDisplayName(g.name, g.gameKey).trim().toLowerCase() === target
  );
  return pickPreferredLinkGame(byDisplay);
}

/**
 * Call the game bot's /search-user API to verify the username exists.
 * @param {string} baseUrl - from game.botApiUrl
 * @param {string} apiKey  - from game.botApiKey
 * @param {string} gameUsername - username to look up on the bot
 * @returns {Promise<{ user_id: number, balance: number, userhash: string }>}
 */
async function callBotSearchUser(baseUrl, apiKey, gameUsername) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/search-user`;

  const res = await axios.post(
    url,
    { username: gameUsername },
    {
      headers: {
        accept: 'application/json',
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }
  );

  console.log('response data', res.data);
  const body = res.data;

  if (res.status !== 200 || !body || body.success !== true) {
    const notFound = isSearchUserNotFoundResponse(res.status, body);
    const err = new Error(
      notFound
        ? SEARCH_USER_NOT_FOUND_MESSAGE
        : (body && body.message) || 'User not found on the game platform.'
    );
    err.statusCode = notFound ? 404 : res.status === 404 ? 404 : 502;
    err.isSearchUserNotFound = notFound;
    if (notFound) err.code = 'GAME_USER_NOT_FOUND';
    // User-not-found: no externalResponse so the API returns { message } via sendError, not raw bot JSON.
    if (!notFound) {
      err.externalResponse = body && typeof body === 'object'
        ? body
        : { detail: 'Unknown response from game provider' };
    }
    throw err;
  }

  return body.data; // { user_id, balance, userhash }
}

/**
 * Link an existing game-platform account to the current user.
 *
 * Flow:
 *  1. Validate the game exists and is active (scoped to the user's store).
 *  2. Make sure this user does not already have an account for the game.
 *  3. Verify the username exists (VegasX: GET /cashier/users match on users.name;
 *     other games: bot /search-user, GameVault getUserId, or VBLink balance).
 *  4. Store the username (and password for OrionStars Agent) in user_game_accounts.
 *
 * @param {number} userId       - from JWT
 * @param {string} gameName     - game to link the account under
 * @param {string} gameUsername - the player's existing username on the game platform
 * @param {string|null} storeCode - from JWT; used to scope the game lookup to the user's store
 * @param {string|null} [gamePassword] - required for OrionStars / Firekirin Agent (balance/queryInfo needs it)
 */
async function linkGameAccount(userId, gameName, gameUsername, storeCode, gamePassword = null) {
  const normalizedGameUsername = String(gameUsername || '').trim();
  const plainPassword = gamePassword != null ? String(gamePassword) : '';
  const game = await findGameByName(gameName, storeCode);

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

  const isVblinkFamily = isVblinkOrUltrapanda(game.name);
  const isGameVault = isGameVaultGame(game);
  const isVegasXCashier = isVegasXGame(game);
  const isFirekirinAgent = isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game);
  const isMilkywayAgent = isMilkywayTerminalGame(game) && !isMilkywayBotAutomationGame(game);
  const isGameroomAgent = isGameroomAgentGame(game) && !isGameroomBotAutomationGame(game);
  const isCashmachineAgent = isCashmachineAgentGame(game) && !isCashmachineBotAutomationGame(game);
  const isMafiaAgent = isMafiaAgentGame(game);
  const isGoldenDragon = isGoldenDragonGame(game);
  const isOrionStarsAgent = isOrionStarsTerminalGame(game) && !isOrionStarsBotAutomationGame(game);

  if (isOrionStarsAgent && !plainPassword.trim()) {
    const err = new Error('Password is required to connect your Orion Stars account.');
    err.statusCode = 400;
    throw err;
  }

  if (isFirekirinAgent && !plainPassword.trim()) {
    const err = new Error('Password is required to connect your Firekirin account.');
    err.statusCode = 400;
    throw err;
  }

  if (isMilkywayAgent && !plainPassword.trim()) {
    const err = new Error('Password is required to connect your Milkyway account.');
    err.statusCode = 400;
    throw err;
  }

  if (isVblinkFamily) {
    if (!game.botApiUrl || !game.appId || !game.appSecret) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (isGameVault) {
    if (!game.agentId || !game.apiSecretKey) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (isVegasXCashier || isGameroomAgent || isCashmachineAgent || isMafiaAgent) {
    if (!game.botUsername || !game.botPassword) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (isFirekirinAgent || isMilkywayAgent || isOrionStarsAgent) {
    if (!game.botApiUrl || !game.botUsername || !game.botPassword) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (!game.botApiUrl || !game.botApiKey) {
    const err = new Error('Game is not configured. Please try again later.');
    err.statusCode = 503;
    throw err;
  }

  // If the user already has this exact game username linked, return it as-is
  // (OrionStars / Firekirin Agent: allow saving/updating password when provided so balance refresh works).
  const existing = await db.UserGameAccount.findOne({
    where: { userId, gameId: game.id }
  });
  const existingUsername = String(existing?.botUsername || '').trim().toLowerCase();
  const enteredUsername = normalizedGameUsername.toLowerCase();
  if (existing && (existing.botUsername || existing.botPassword)) {
    if (existingUsername && enteredUsername && existingUsername === enteredUsername) {
      if ((isOrionStarsAgent || isFirekirinAgent || isMilkywayAgent) && plainPassword.trim()) {
        const verifyBalance = isFirekirinAgent
          ? () => queryFirekirinUserBalanceWithAgentLogin(game, normalizedGameUsername, plainPassword)
          : isMilkywayAgent
            ? () => queryMilkywayUserBalanceWithAgentLogin(game, normalizedGameUsername, plainPassword)
            : () => queryOrionStarsUserBalanceWithAgentLogin(game, normalizedGameUsername, plainPassword);
        try {
          await withBotRetry(
            verifyBalance,
            {
              logContext: buildBotLogContext({
                game,
                operation: 'link_account',
                storeCode,
                gameUsername: normalizedGameUsername,
                apiEndpoint: '/ws/service.ashx?action=queryInfo'
              })
            }
          );
        } catch (err) {
          if (err.isSearchUserNotFound || err.isUserNotFound || err.code === 'GAME_USER_NOT_FOUND') {
            const notFoundErr = new Error(
              String(err.message || '').trim() || 'The account does not exist. Please check and try again.'
            );
            notFoundErr.statusCode = 404;
            notFoundErr.isSearchUserNotFound = true;
            notFoundErr.code = 'GAME_USER_NOT_FOUND';
            throw notFoundErr;
          }
          if (err.isInvalidPassword || /pass\s*word/i.test(String(err.message || ''))) {
            const badPassErr = new Error('Incorrect game password. Please check and try again.');
            badPassErr.statusCode = 400;
            badPassErr.code = 'GAME_INVALID_PASSWORD';
            throw badPassErr;
          }
          throw err;
        }
        await existing.update({
          botPassword: plainPassword.slice(0, 256),
          status: 'active'
        });
        return {
          success: true,
          message: `Account "${existing.botUsername}" linked successfully.`,
          data: { account_name: existing.botUsername }
        };
      }
      return {
        success: true,
        message: 'You already have an account linked for this game.',
        data: { account_name: existing.botUsername }
      };
    }
    // Different username entered — verify the new one and update the linked account below.
  }

  if (isAlphanumeric5To20UsernameGame(game.name) && normalizedGameUsername.length < 5) {
    const err = new Error('Please enter a valid game username with at least 5 characters.');
    err.statusCode = 400;
    throw err;
  }

  if (!isVegasXCashier && !isAlphanumeric5To20UsernameGame(game.name) && normalizedGameUsername.length < MIN_LINK_GAME_USERNAME_LENGTH) {
    const err = new Error('Please enter a valid game username with at least 6 characters.');
    err.statusCode = 400;
    throw err;
  }

  if (isVegasXCashier && !normalizedGameUsername) {
    const err = new Error('Please enter your game username.');
    err.statusCode = 400;
    throw err;
  }

  if (!isVegasXCashier && !isAlphanumeric6To20UsernameGame(game.name) && !/^[a-zA-Z]/.test(normalizedGameUsername)) {
    const err = new Error('Game username must start with a letter, not a number.');
    err.statusCode = 400;
    throw err;
  }

  const usernameAvailabilityOpts = { gameName: game.name };

  await assertGameUsernameAvailable(
    game.id,
    normalizedGameUsername,
    userId,
    usernameAvailabilityOpts
  );

  if (game.botOffline) {
    return {
      success: true,
      message: GAME_LINK_PENDING,
      data: { account_name: normalizedGameUsername }
    };
  }

  const onInvalidApiKey = async () => {
    const r = await refreshGameBotApiKey(game.id);
    game.botApiKey = r.api_key;
  };
  const linkLogContext = buildBotLogContext({
    game,
    operation: 'link_account',
    storeCode,
    gameUsername: normalizedGameUsername,
    apiEndpoint: isVblinkFamily
      ? '/fast/user/balance'
      : isGameVault
        ? '/api/external/getUserId'
        : isVegasXCashier
          ? '/cashier/users'
          : isGameroomAgent
            ? '/api/player/playerList'
            : isCashmachineAgent
              ? '/api/player/playerList'
              : isMafiaAgent
                ? '/api/player/playerList'
                : (isFirekirinAgent || isMilkywayAgent || isOrionStarsAgent)
              ? '/ws/service.ashx?action=queryInfo'
              : '/search-user'
  });
  let providerUserId = null;
  let linkedBotUsername = normalizedGameUsername;
  let goldenDragonPinId = null;
  try {
    // Verify the username exists: VBLink / UltraPanda / Egame99 use provider /fast/user/balance;
    // GameVault uses getUserId; VegasX matches users.name via GET /cashier/users;
    // Firekirin / OrionStars Agent use queryInfo; others use bot /search-user.
    if (isVblinkFamily) {
      await withBotRetry(
        () => callVblinkUltrapandaBalance(
          game.botApiUrl,
          game.appId,
          game.appSecret,
          normalizedGameUsername,
          { linkVerification: true }
        ),
        { logContext: linkLogContext }
      );
    } else if (isGameVault) {
      providerUserId = await withBotRetry(
        () => callGameVaultGetUserId(game, game.agentId, game.apiSecretKey, normalizedGameUsername),
        { logContext: linkLogContext }
      );
    } else if (isVegasXCashier) {
      // Agent API flow:
      // 1) Bearer token from games.streamlit_token (store-added game), refresh via POST /cashier/login on 401
      // 2) GET /cashier/users?search={name} then exact match on users[].name
      // 3) Fallback: GET /cashier/users and scan users[].name
      console.log('[vegasx] link_account start', {
        gameId: game.id,
        gameName: game.name,
        gameKey: game.gameKey,
        botApiUrl: game.botApiUrl,
        hasBotUsername: Boolean(game.botUsername),
        enteredName: normalizedGameUsername
      });
      const matched = await withBotRetry(
        () => withVegasXCashierTokenRetry(
          game,
          (token) => findVegasXCashierUserByName(game, token, normalizedGameUsername),
          { preferStoredToken: true }
        ),
        { logContext: linkLogContext }
      );
      providerUserId = matched.id;
      linkedBotUsername = matched.name || normalizedGameUsername;
      console.log('[vegasx] link_account matched', {
        providerUserId,
        linkedBotUsername
      });
    } else if (isGameroomAgent) {
      const matched = await withBotRetry(
        () => withGameroomAgentTokenRetry(
          game,
          (token) => findGameroomPlayerByUsername(game, token, normalizedGameUsername),
          { preferStoredToken: true }
        ),
        { logContext: linkLogContext }
      );
      if (!matched || !matched.id) {
        const notFoundErr = new Error(SEARCH_USER_NOT_FOUND_MESSAGE);
        notFoundErr.statusCode = 404;
        notFoundErr.isSearchUserNotFound = true;
        notFoundErr.code = 'GAME_USER_NOT_FOUND';
        throw notFoundErr;
      }
      providerUserId = matched.id;
      linkedBotUsername = matched.account || normalizedGameUsername;
    } else if (isCashmachineAgent) {
      const matched = await withBotRetry(
        () => withCashmachineAgentTokenRetry(
          game,
          (token) => findCashmachinePlayerByUsername(game, token, normalizedGameUsername),
          { preferStoredToken: true }
        ),
        { logContext: linkLogContext }
      );
      if (!matched || !matched.id) {
        const notFoundErr = new Error(SEARCH_USER_NOT_FOUND_MESSAGE);
        notFoundErr.statusCode = 404;
        notFoundErr.isSearchUserNotFound = true;
        notFoundErr.code = 'GAME_USER_NOT_FOUND';
        throw notFoundErr;
      }
      providerUserId = matched.id;
      linkedBotUsername = matched.account || normalizedGameUsername;
    } else if (isMafiaAgent) {
      const matched = await withBotRetry(
        () => withMafiaAgentTokenRetry(
          game,
          (token) => findMafiaPlayerByUsername(game, token, normalizedGameUsername),
          { preferStoredToken: true }
        ),
        { logContext: linkLogContext }
      );
      if (!matched || !matched.id) {
        const notFoundErr = new Error(SEARCH_USER_NOT_FOUND_MESSAGE);
        notFoundErr.statusCode = 404;
        notFoundErr.isSearchUserNotFound = true;
        notFoundErr.code = 'GAME_USER_NOT_FOUND';
        throw notFoundErr;
      }
      providerUserId = matched.id;
      linkedBotUsername = matched.account || normalizedGameUsername;
    } else if (isFirekirinAgent) {
      await withBotRetry(
        () => queryFirekirinUserBalanceWithAgentLogin(game, normalizedGameUsername, plainPassword),
        { logContext: linkLogContext }
      );
    } else if (isMilkywayAgent) {
      await withBotRetry(
        () => queryMilkywayUserBalanceWithAgentLogin(game, normalizedGameUsername, plainPassword),
        { logContext: linkLogContext }
      );
    } else if (isOrionStarsAgent) {
      // queryInfo needs the real player password — validate credentials and keep for balance refresh.
      await withBotRetry(
        () => queryOrionStarsUserBalanceWithAgentLogin(game, normalizedGameUsername, plainPassword),
        { logContext: linkLogContext }
      );
    } else if (isGoldenDragon) {
      const searched = await withBotRetry(
        () => callGoldenDragonSearchUser(game.botApiUrl, game.botApiKey, normalizedGameUsername),
        { onInvalidApiKey, logContext: linkLogContext }
      );
      goldenDragonPinId = searched.customer_id;
      if (searched.mobile_id) {
        linkedBotUsername = searched.mobile_id;
      }
    } else {
      await withBotRetry(
        () => callBotSearchUser(game.botApiUrl, game.botApiKey, normalizedGameUsername),
        { onInvalidApiKey, logContext: linkLogContext }
      );
    }
  } catch (err) {
    if (isGameUsernameTakenError(err)) {
      throw err;
    }
    if (isVegasXCashier || isGameroomAgent || isCashmachineAgent || isMafiaAgent) {
      // Only treat an explicit no-match as "User not found."
      // API/auth/config failures must not be remapped to a not-found message.
      if (err.isSearchUserNotFound || err.code === 'GAME_USER_NOT_FOUND') {
        const notFoundErr = new Error((isGameroomAgent || isCashmachineAgent || isMafiaAgent) ? SEARCH_USER_NOT_FOUND_MESSAGE : VEGASX_USER_NOT_FOUND_MESSAGE);
        notFoundErr.statusCode = 404;
        notFoundErr.isSearchUserNotFound = true;
        notFoundErr.code = 'GAME_USER_NOT_FOUND';
        throw notFoundErr;
      }
    } else if (isFirekirinAgent || isMilkywayAgent || isOrionStarsAgent) {
      // Show provider's own not-found / does-not-exist message to the user.
      if (err.isSearchUserNotFound || err.isUserNotFound || err.code === 'GAME_USER_NOT_FOUND') {
        const providerMsg = String(err.message || '').trim()
          || 'The account does not exist. Please check and try again.';
        const notFoundErr = new Error(providerMsg);
        notFoundErr.statusCode = 404;
        notFoundErr.isSearchUserNotFound = true;
        notFoundErr.code = 'GAME_USER_NOT_FOUND';
        throw notFoundErr;
      }
      if ((isOrionStarsAgent || isFirekirinAgent || isMilkywayAgent) && (err.isInvalidPassword || /pass\s*word/i.test(String(err.message || '')))) {
        const badPassErr = new Error('Incorrect game password. Please check and try again.');
        badPassErr.statusCode = 400;
        badPassErr.code = 'GAME_INVALID_PASSWORD';
        throw badPassErr;
      }
    } else if (isGameVault) {
      const isUserNotFound =
        err.isSearchUserNotFound ||
        err.isInvalidUserId ||
        err.gameVaultCode === 8 ||
        err.code === 'GAME_USER_NOT_FOUND' ||
        isSearchUserNotFoundResponse(err.statusCode || 502, err.externalResponse) ||
        (err.message && (
          err.message.toLowerCase().includes('invalid user id') ||
          err.message.toLowerCase().includes('invalid user') ||
          err.message.toLowerCase().includes('user invalid') ||
          err.message.toLowerCase().includes('user not found') ||
          err.message.toLowerCase().includes('username not found') ||
          err.message.toLowerCase().includes('player not found')
        ));
      if (isUserNotFound) {
        const notFoundErr = new Error('Please enter a valid username.');
        notFoundErr.statusCode = 404;
        notFoundErr.isSearchUserNotFound = true;
        notFoundErr.code = 'GAME_USER_NOT_FOUND';
        throw notFoundErr;
      }
    }

    if (err.isSearchUserNotFound) {
      throw err;
    }
    if (isBotApiFailure(err)) {
      const refreshedGame = await db.Game.findByPk(game.id, { attributes: ['botOffline'] });
      return {
        success: true,
        message: refreshedGame?.botOffline
          ? GAME_LINK_PENDING
          : GAME_REQUEST_IN_PROGRESS,
        data: { account_name: normalizedGameUsername }
      };
    }
    throw err;
  }

  // Store the account. OrionStars / Firekirin Agent need the player password for later balance/queryInfo calls.
  try {
    await db.sequelize.transaction(async (t) => {
      await assertGameUsernameAvailable(game.id, linkedBotUsername, userId, {
        ...usernameAvailabilityOpts,
        providerUserId,
        transaction: t
      });

      const accountRow = {
        userId,
        gameId: game.id,
        botUsername: linkedBotUsername,
        botPassword: (isOrionStarsAgent || isFirekirinAgent || isMilkywayAgent)
          ? plainPassword.slice(0, 256)
          : (isGoldenDragon && goldenDragonPinId ? String(goldenDragonPinId).slice(0, 256) : null),
        status: 'active'
      };
      if ((isGameVault || isVegasXCashier || isGameroomAgent || isCashmachineAgent || isMafiaAgent) && providerUserId) {
        accountRow.providerUserId = String(providerUserId).slice(0, 64);
      }

      const existing = await db.UserGameAccount.findOne({
        where: { userId, gameId: game.id },
        transaction: t
      });
      if (existing) {
        await existing.update(accountRow, { transaction: t });
      } else {
        await db.UserGameAccount.create(accountRow, { transaction: t });
      }

      await db.GameActivity.create(
        {
          userId,
          gameId: game.id,
          activityType: 'link'
        },
        { transaction: t }
      );
    });
  } catch (err) {
    rethrowGameUsernameConflict(err, game.name);
  }

  return {
    success: true,
    message: `Account "${linkedBotUsername}" linked successfully.`,
    data: { account_name: linkedBotUsername }
  };
}

module.exports = { linkGameAccount };
