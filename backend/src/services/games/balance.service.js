'use strict';

const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { withBotRetry, isBotApiFailure, captureBotApiResponse } = require('../../utils/botApiHelper');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const { refreshGameBotApiKey } = require('./addGame.service');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { isGameVaultGame, callGameVaultAgentBalance, withGameVaultProviderUserIdRetry } = require('./gamevault.helpers');
const { isVegasXGame, callVegasXCashierGetUser, withVegasXCashierTokenRetry } = require('./vegasx.helpers');
const { isOrionStarsTerminalGame, queryOrionStarsUserBalance } = require('./orionstars.helpers');
const { isFirekirinTerminalGame, queryFirekirinUserBalance, isFirekirinInvalidPlayerPasswordError } = require('./firekirin.helpers');
const { isMilkywayTerminalGame, queryMilkywayUserBalance, isMilkywayInvalidPlayerPasswordError } = require('./milkyway.helpers');
const { isGameroomAgentGame, queryGameroomUserBalance, withGameroomProviderUserIdRetry } = require('./gameroom.helpers');
const { isCashmachineAgentGame, queryCashmachineUserBalance, withCashmachineProviderUserIdRetry } = require('./cashmachine.helpers');
const { isMafiaAgentGame, queryMafiaUserBalance, withMafiaProviderUserIdRetry } = require('./mafia.helpers');
const { isGoldenDragonGame, callGoldenDragonGetUserScore, resolveGoldenDragonCustomerId } = require('./goldenDragon.helpers');
const {
  isOrionStarsBotAutomationGame,
  isFirekirinBotAutomationGame,
  isMilkywayBotAutomationGame,
  isGameroomBotAutomationGame,
  isCashmachineBotAutomationGame
} = require('../../utils/gameIntegration.helpers');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;

function unavailableGameBalanceResult(extra = {}) {
  return {
    success: true,
    balance: null,
    unavailable: true,
    message: 'Balance is temporarily unavailable. Please try again later.',
    ...extra
  };
}

function firekirinPasswordStaleBalanceResult() {
  return {
    success: true,
    balance: null,
    passwordStale: true,
    code: 'GAME_PASSWORD_STALE',
    message: 'Your game password has changed. Please update your password to refresh balance.'
  };
}

function milkywayPasswordStaleBalanceResult() {
  return {
    success: true,
    balance: null,
    passwordStale: true,
    code: 'GAME_PASSWORD_STALE',
    message: 'Your game password has changed. Please update your password to refresh balance.'
  };
}

/** Game names that use third-party fast/user/balance API (VBLink / UltraPanda / Egame99). */
const VBLINK_ULTRAPANDA_NAMES = ['Vblink', 'UltraPanda', 'Egame99'];

/** Same copy as linkGameAccount when the provider has no account for this username. */
const VBLINK_LINK_USER_NOT_FOUND_MESSAGE =
    'Player not found. Use the same username you use to log in to this game.';

function isVblinkOrUltrapanda(gameName) {
    const name = String(gameName || '').trim();
    return VBLINK_ULTRAPANDA_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

/** Generate sign for VBLink/UltraPanda: MD5(sorted key=value string + appSecret). */
function generateVblinkSign(data, appSecret) {
    const sortedKeys = Object.keys(data).sort();
    const queryString = sortedKeys.map((key) => `${key}=${data[key]}`).join('&');
    const finalString = queryString + appSecret;
    return crypto.createHash('md5').update(finalString, 'utf8').digest('hex');
}

/**
 * Call the game bot's balance API.
 * @param {string} baseUrl - from game.botApiUrl
 * @param {string} apiKey - from game.botApiKey
 * @param {string} accountName - username registered on the bot (botUsername)
 * @returns {Promise<number>}
 */
async function callBotBalance(baseUrl, apiKey, accountName) {
    const url = `${String(baseUrl || '').replace(/\/$/, '')}/get-user-score`;

    const body = {
        username: accountName
    };

    const res = await axios.post(url, body, {
        headers: {
            accept: 'application/json',
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
        },
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: () => true
    });

    console.log(res.data);
    const data = res.data;
    if (res.status !== 200 || !data || data.success !== true) {
        const err = new Error('Game provider failed to fetch the balance.');
        err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
        err.externalResponse = captureBotApiResponse(data, res.status);
        throw err;
    }

    // API returns: { success: true, data: { username: "...", score: 1 } }
    // So we read data.data.score as the balance
    return Number((data.data && data.data.score) || 0);
}

/**
 * Call VBLink/UltraPanda third-party API: POST {baseUrl}/fast/user/balance
 * Body: application/x-www-form-urlencoded with requestid, appid, timestamp, sign, account (no amount, no passwd).
 * requestid = "BAL" + Date.now(); sign = MD5(sorted key=value string + appSecret).
 * @param {{ linkVerification?: boolean }} [options]
 *   - **Omit or `linkVerification: false`** (balance / `getGameBalance`): same behavior as before this option existed — body `code` 2 maps to `Balance check failed: User does not exist` with **502**; other provider codes also use **502** (manual-mode path can run).
 *   - **`linkVerification: true`** (link account only): `code: 2` → 404 user-not-found; other provider codes use **400** so manual mode is not triggered.
 * @returns {Promise<{ balance: number, deposit: number }>}
 */
async function callVblinkUltrapandaBalance(baseUrl, appId, appSecret, account, options = {}) {
    const { linkVerification = false } = options;
    const url = `${String(baseUrl || '').replace(/\/$/, '')}/fast/user/balance`;
    const requestid = `BAL${Date.now()}`;
    const timestamp = Date.now().toString();

    const data = {
        requestid,
        appid: appId,
        timestamp,
        account
    };
    data.sign = generateVblinkSign(data, appSecret);

    const body = new URLSearchParams(data).toString();

    const res = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: () => true
    });

    console.log(res.data);
    const response = res.data;
    const code = response && (response.code ?? response.Code);
    const responseData = response && (response.data || response.Data);

    if (res.status !== 200) {
        const err = new Error('Failed to fetch game balance. Please try again later.');
        err.statusCode =
            linkVerification && res.status >= 400 && res.status < 500
                ? 400
                : res.status >= 400
                    ? res.status
                    : 502;
        err.externalResponse = response;
        throw err;
    }

    if (code === 200) {
        const balance = Number(responseData && responseData.balance) || 0;
        const deposit = Number(responseData && responseData.deposit) != null ? Number(responseData.deposit) : 0;
        return { balance, deposit };
    }

    if (linkVerification && code === 2) {
        const err = new Error(VBLINK_LINK_USER_NOT_FOUND_MESSAGE);
        err.statusCode = 404;
        err.isSearchUserNotFound = true;
        err.code = 'GAME_USER_NOT_FOUND';
        throw err;
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
    const err = new Error(`Balance check failed: ${message}`);
    err.statusCode = linkVerification ? 400 : 502;
    err.externalResponse = response;
    throw err;
}

/**
 * Fetch a user's game account balance from the provider.
 *
 * @param {number} userId - from JWT
 * @param {number} gameId - game ID to look up
 * @returns {Promise<{ success: boolean, balance: number }>}
 */
async function getGameBalance(userId, gameId) {
    const attrs = [
        'id', 'name', 'gameKey', 'gameTemplateId', 'botApiUrl', 'botApiKey', 'streamlitToken',
        'botUsername', 'botPassword', 'isActive', 'botOffline', 'appId', 'appSecret', 'addedByStoreCode',
        'agentId', 'apiSecretKey'
    ];
    const game = await db.Game.findByPk(gameId, { attributes: attrs });

    if (!game) {
        const err = new Error('Game not found.');
        err.statusCode = 404;
        throw err;
    }

    if (!game.isActive) {
        const err = new Error('This game is currently inactive.');
        err.statusCode = 400;
        throw err;
    }

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
    if (isGameVault) {
        const agentId = String(game.agentId || '').trim();
        const apiSecretKey = String(game.apiSecretKey || '').trim();
        if (!agentId || !apiSecretKey) {
            const err = new Error('Game is not configured. Please try again later.');
            err.statusCode = 503;
            throw err;
        }
    } else if (isVegasXCashier) {
        if (!game.botUsername || !game.botPassword) {
            const err = new Error('Game is not configured. Please try again later.');
            err.statusCode = 503;
            throw err;
        }
    } else if (isOrionStars || isFirekirinAgent || isMilkywayAgent || isGameroomAgent || isCashmachineAgent || isMafiaAgent) {
        if (!game.botUsername || !game.botPassword) {
            const err = new Error('Game is not configured. Please try again later.');
            err.statusCode = 503;
            throw err;
        }
    } else if (isVblinkUltrapanda) {
        if (!game.botApiUrl || !game.appId || !game.appSecret) {
            const err = new Error('Game is not configured. Please try again later.');
            err.statusCode = 503;
            throw err;
        }
    } else {
        if (!game.botApiUrl || !game.botApiKey) {
            const err = new Error('Game is not configured. Please try again later.');
            err.statusCode = 503;
            throw err;
        }
    }

    const userGameAccount = await db.UserGameAccount.findOne({
        where: { userId, gameId: game.id }
    });

    if (!userGameAccount) {
        const err = new Error('You do not have a registered account for this game.');
        err.statusCode = 404;
        throw err;
    }

    if (!userGameAccount.botUsername) {
        const err = new Error('Your game account is not fully configured (missing bot username).');
        err.statusCode = 400;
        throw err;
    }

    // Manual mode: never call the bot for balance (avoids long timeouts / stuck Loading UI).
    if (game.botOffline) {
        return {
            success: true,
            balance: null,
            winnings: null,
            manual_mode: true,
            message: 'Game is in manual mode. Provider balance is unavailable; enter the amount to request.'
        };
    }

    const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
    const balanceLogContext = buildBotLogContext({
        game,
        operation: 'balance',
        storeCode: user?.storeCode,
        gameUsername: userGameAccount.botUsername,
        apiEndpoint: (isOrionStars || isFirekirinAgent || isMilkywayAgent)
            ? '/ws/service.ashx?action=queryInfo'
            : (isVegasXCashier
                ? '/cashier/user/{id}'
                : ((isGameroomAgent || isCashmachineAgent || isMafiaAgent)
                    ? '/api/player/getScore'
                    : (isGameVault ? '/api/external/agentBalance' : '/balance')))
    });

    if (isVegasXCashier) {
        const providerUserId = userGameAccount.providerUserId != null
            ? String(userGameAccount.providerUserId).trim()
            : '';
        if (!providerUserId) {
            const err = new Error('Your VegasX account is missing provider ID. Please register the game account again.');
            err.statusCode = 400;
            throw err;
        }
        try {
            const { balance } = await withBotRetry(
                () => withVegasXCashierTokenRetry(
                    game,
                    (token) => callVegasXCashierGetUser(game, token, providerUserId),
                    { preferStoredToken: true }
                ),
                { logContext: balanceLogContext }
            );
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    // Balance checks should still use the game's bot API even when the game is marked manual.
    // The balance service is intentionally kept automatic and will not switch the game into manual mode.
    if (isGameVault) {
        const agentId = String(game.agentId || '').trim();
        const apiSecretKey = String(game.apiSecretKey || '').trim();
        if (!agentId || !apiSecretKey) {
            const err = new Error('Game is not configured. Please try again later.');
            err.statusCode = 503;
            throw err;
        }
        const { balance } = await withGameVaultProviderUserIdRetry({
            game,
            userGameAccount,
            agentId,
            apiSecretKey,
            transaction: null,
            operation: (providerUserId) => withBotRetry(
                () => callGameVaultAgentBalance(
                    game,
                    agentId,
                    apiSecretKey,
                    providerUserId
                ),
                { logContext: balanceLogContext }
            )
        });
        return {
            success: true,
            balance
        };
    }

    if (isVblinkUltrapanda) {
        // Explicitly not link verification: preserve legacy balance semantics (502 on provider errors, including code 2).
        const { balance, deposit } = await withBotRetry(
            () => callVblinkUltrapandaBalance(
                game.botApiUrl,
                game.appId,
                game.appSecret,
                userGameAccount.botUsername,
                { linkVerification: false }
            ),
            { logContext: balanceLogContext }
        );
        return {
            success: true,
            balance,
            deposit
        };
    }

    if (isGoldenDragon) {
        const onInvalidApiKey = async () => {
            const r = await refreshGameBotApiKey(game.id);
            game.botApiKey = r.api_key;
        };
        try {
            const pinId = await withBotRetry(
                async () => {
                    const id = await resolveGoldenDragonCustomerId(userGameAccount, game);
                    if (!id) {
                        const err = new Error('Your Golden Dragon account is missing pin_id. Please register again.');
                        err.statusCode = 400;
                        throw err;
                    }
                    return id;
                },
                { onInvalidApiKey, logContext: balanceLogContext }
            );
            const { entries, winnings } = await withBotRetry(
                () => callGoldenDragonGetUserScore(game.botApiUrl, game.botApiKey, pinId),
                { onInvalidApiKey, logContext: balanceLogContext }
            );
            return {
                success: true,
                balance: entries,
                entries,
                winnings
            };
        } catch (err) {
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult({ entries: null, winnings: null });
            }
            throw err;
        }
    }

    if (isOrionStars) {
        if (!userGameAccount.botPassword) {
            const err = new Error('Your game account is missing password. Please register the game account again.');
            err.statusCode = 400;
            throw err;
        }
        try {
            const balance = await withBotRetry(
                () => queryOrionStarsUserBalance(
                    game,
                    userGameAccount.botUsername,
                    userGameAccount.botPassword,
                    { callBotBalance }
                ),
                { logContext: balanceLogContext }
            );
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    if (isGameroomAgent) {
        try {
            const { balance } = await withGameroomProviderUserIdRetry({
                game,
                userGameAccount,
                operation: (providerUserId) => withBotRetry(
                    () => queryGameroomUserBalance(game, providerUserId),
                    { logContext: balanceLogContext }
                )
            });
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    if (isCashmachineAgent) {
        try {
            const { balance } = await withCashmachineProviderUserIdRetry({
                game,
                userGameAccount,
                operation: (providerUserId) => withBotRetry(
                    () => queryCashmachineUserBalance(game, providerUserId),
                    { logContext: balanceLogContext }
                )
            });
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    if (isMafiaAgent) {
        try {
            const { balance } = await withMafiaProviderUserIdRetry({
                game,
                userGameAccount,
                operation: (providerUserId) => withBotRetry(
                    () => queryMafiaUserBalance(game, providerUserId),
                    { logContext: balanceLogContext }
                )
            });
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    if (isFirekirinAgent) {
        if (!userGameAccount.botPassword) {
            const err = new Error('Your game account is missing password. Please register the game account again.');
            err.statusCode = 400;
            throw err;
        }
        try {
            const balance = await withBotRetry(
                () => queryFirekirinUserBalance(
                    game,
                    userGameAccount.botUsername,
                    userGameAccount.botPassword
                ),
                { logContext: balanceLogContext }
            );
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isFirekirinInvalidPlayerPasswordError(err)) {
                return firekirinPasswordStaleBalanceResult();
            }
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    if (isMilkywayAgent) {
        if (!userGameAccount.botPassword) {
            const err = new Error('Your game account is missing password. Please register the game account again.');
            err.statusCode = 400;
            throw err;
        }
        try {
            const balance = await withBotRetry(
                () => queryMilkywayUserBalance(
                    game,
                    userGameAccount.botUsername,
                    userGameAccount.botPassword
                ),
                { logContext: balanceLogContext }
            );
            return {
                success: true,
                balance
            };
        } catch (err) {
            if (isMilkywayInvalidPlayerPasswordError(err)) {
                return milkywayPasswordStaleBalanceResult();
            }
            if (isBotApiFailure(err)) {
                return unavailableGameBalanceResult();
            }
            throw err;
        }
    }

    const onInvalidApiKey = async () => {
        const r = await refreshGameBotApiKey(game.id);
        game.botApiKey = r.api_key;
    };
    try {
        const balance = await withBotRetry(
            () => callBotBalance(game.botApiUrl, game.botApiKey, userGameAccount.botUsername),
            { onInvalidApiKey, logContext: balanceLogContext }
        );
        return {
            success: true,
            balance
        };
    } catch (err) {
        if (isBotApiFailure(err)) {
            return unavailableGameBalanceResult();
        }
        throw err;
    }
}

module.exports = { getGameBalance, isVblinkOrUltrapanda, callVblinkUltrapandaBalance };
