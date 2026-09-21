'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { registerGameAccount } = require('../../services/games/registerGameAccount.service');
const { depositGameAccount } = require('../../services/games/deposit.service');
const { withdrawGameAccount } = require('../../services/games/withdraw.service');
const { redeemGameAccount } = require('../../services/games/redeem.service');
const { getGameBalance: fetchGameBalance } = require('../../services/games/balance.service');
const { syncFirekirinGamePassword } = require('../../services/games/syncFirekirinGamePassword.service');
const { syncMilkywayGamePassword } = require('../../services/games/syncMilkywayGamePassword.service');
const {
    getFirekirinExclusiveGames,
    enterFirekirinExclusiveGame
} = require('../../services/games/getFirekirinExclusiveGames.service');
const {
    getMilkywayExclusiveGames,
    enterMilkywayExclusiveGame
} = require('../../services/games/getMilkywayExclusiveGames.service');
const {
    isFirekirinTerminalGame,
    isFirekirinBotAutomationGame,
    isMilkywayTerminalGame,
    isMilkywayBotAutomationGame
} = require('../../utils/gameIntegration.helpers');
const { getGamePlayEligibility } = require('../../services/games/gamePlayEligibility.service');
const { GAME_DEPOSIT_AMOUNT_ERROR, GAME_WITHDRAW_AMOUNT_ERROR } = require('../../utils/integerScGame.helpers');
const {
    getStoreGameDisplayName,
    isOrionStarsGame,
    isOrionStarsBotAutomationGame,
    isCustomManualGame
} = require('../../utils/gameIntegration.helpers');
const { isJuwaNewBotGame, resolveJuwaNewBotImageUrl, findLegacyJuwaImageUrlForStore } = require('../../services/games/juwa.helpers');
const {
  isPandamasterNewBotGame,
  resolvePandamasterNewBotImageUrl,
  findLegacyPandamasterImageUrlForStore
} = require('../../services/games/pandamaster.helpers');
const { BOT_UNAVAILABLE_MESSAGE } = require('../../utils/botApiHelper');

function parseId(reqId) {
    const id = parseInt(reqId, 10);
    return Number.isNaN(id) ? null : id;
}

/** Never leak timeout / rate-limit / transport wording to the user on game money moves. */
function sanitizeGameTransferError(err) {
    if (!err) return { message: BOT_UNAVAILABLE_MESSAGE, statusCode: 503, code: null };
    const status = Number(err.statusCode || 0);
    const msg = String(err.message || '').toLowerCase();
    const isSilent =
        status === 429
        || status === 408
        || status === 504
        || err.isBotUnavailable === true
        || err.isRateLimited === true
        || msg.includes('timeout')
        || msg.includes('timed out')
        || msg.includes('rate limit')
        || msg.includes('too many request')
        || msg.includes('too many attempts')
        || msg.includes('econnaborted')
        || msg.includes('etimedout');
    if (isSilent) {
        return {
            message: BOT_UNAVAILABLE_MESSAGE,
            statusCode: status === 429 ? 429 : (err.statusCode || 503),
            code: err.code || null
        };
    }
    return {
        message: err.message || 'Request could not be completed.',
        statusCode: err.statusCode || 500,
        code: err.code || null
    };
}

/**
 * GET /api/games
 * List all active games. If user is authenticated, attach has_account and account_status.
 */
async function list(req, res) {
    try {
        const userId = req.user ? req.user.userId : null;
        // Authenticated users are scoped to their own store. Guests (public landing
        // page) pass ?store_code= so they still see this store's games.
        const storeCode = (req.user && req.user.storeCode)
            ? req.user.storeCode
            : (req.query.store_code && String(req.query.store_code).trim()) || null;
        const where = { isActive: true, addedByStoreCode: storeCode || null };

        const games = await db.Game.findAll({
            where,
            order: [['displayOrder', 'ASC'], ['id', 'ASC']],
            attributes: [
                'id', 'name', 'imageUrl', 'botType', 'minWithdrawalLimit', 'maxWithdrawalLimit',
                'minDepositLimit', 'maxDepositLimit', 'depositDiscountPercent',
                'platformGameUrl', 'isActive', 'displayOrder', 'gameKey', 'botApiKey',
                'streamlitToken', 'agentId', 'botOffline'
            ]
        });

        let userAccountsMap = new Map();
        let pendingRegisterGameIds = new Set();
        if (userId) {
            const accounts = await db.UserGameAccount.findAll({
                where: { userId },
                attributes: ['gameId', 'status', 'botUsername', 'botPassword']
            });
            for (const acc of accounts) {
                userAccountsMap.set(acc.gameId, { status: acc.status, user: acc.botUsername, pass: acc.botPassword });
            }
            const pendingRegisters = await db.GameManualRequest.findAll({
                where: { userId, requestType: 'register', status: 'pending' },
                attributes: ['gameId']
            });
            for (const r of pendingRegisters) pendingRegisterGameIds.add(r.gameId);
        }

        const listWithInternalFields = games.map((g) => {
            const gJson = g.toJSON();
            gJson.name = getStoreGameDisplayName(gJson.name, gJson.gameKey);
            if (userId && userAccountsMap.has(g.id)) {
                const accData = userAccountsMap.get(g.id);
                const isActive = accData.status === 'active' || accData.status === 'approved';
                if (isActive && !accData.user) {
                    gJson.has_account = false;
                    gJson.account_status = null;
                } else {
                    gJson.has_account = true;
                    gJson.account_status = isActive ? 'approved' : accData.status;
                    if (gJson.account_status === 'approved') {
                        gJson.bot_username = accData.user;
                        gJson.bot_password = accData.pass;
                    }
                }
            } else if (userId && pendingRegisterGameIds.has(g.id)) {
                gJson.has_account = true;
                gJson.account_status = 'pending';
            } else if (userId) {
                gJson.has_account = false;
                gJson.account_status = null;
            }
            return gJson;
        });

        const withImages = listWithInternalFields.map((game) => ({
            ...game,
            imageUrl: resolvePandamasterNewBotImageUrl(
                { ...game, imageUrl: resolveJuwaNewBotImageUrl(game, listWithInternalFields) },
                listWithInternalFields
            )
        }));

        const byDisplayKey = new Map();
        for (const game of withImages) {
            const displayName = String(game.name || '').trim().toLowerCase();
            const displayKey = isOrionStarsGame(game)
                ? `orionstars:${displayName}`
                : `game:${game.id}`;
            const current = byDisplayKey.get(displayKey);
            if (!current) {
                byDisplayKey.set(displayKey, game);
                continue;
            }
            const gameIsBot = isOrionStarsBotAutomationGame(game);
            const currentIsBot = isOrionStarsBotAutomationGame(current);
            if (
                (gameIsBot && !currentIsBot) ||
                (gameIsBot === currentIsBot && Number(game.id) > Number(current.id))
            ) {
                byDisplayKey.set(displayKey, game);
            }
        }

        const list = [...byDisplayKey.values()].map((game) => {
            const {
                gameKey,
                botApiKey,
                streamlitToken,
                agentId,
                ...safeGame
            } = game;
            safeGame.botOffline = Boolean(game.botOffline);
            safeGame.isCustomManual = isCustomManualGame({ gameKey, name: game.name });
            safeGame.gameKey = gameKey || null;
            return safeGame;
        });

        sendSuccess(res, { games: list });
    } catch (err) {
        sendError(res, err.message || 'Failed to list games', err.statusCode || 500);
    }
}

/**
 * GET /api/games/play-eligibility
 * Whether the user may play slots and top up / redeem platform games.
 */
async function playEligibility(req, res) {
    try {
        const data = await getGamePlayEligibility(req.user.userId);
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err.message || 'Failed to check play eligibility', err.statusCode || 500, err.code || null);
    }
}

/**
 * GET /api/games/:id
 * Get one active game by id. If user is authenticated and registered, attach bot_username and bot_password.
 */
async function get(req, res) {
    try {
        const userId = req.user ? req.user.userId : null;
        const gameId = parseId(req.params.id);

        if (!gameId) {
            return sendError(res, 'Invalid game id', 400);
        }

        const storeCode = (req.user && req.user.storeCode)
            ? req.user.storeCode
            : (req.query.store_code && String(req.query.store_code).trim()) || null;
        const game = await db.Game.findOne({
            where: { id: gameId, isActive: true, addedByStoreCode: storeCode || null },
            attributes: [
                'id', 'name', 'imageUrl', 'botType', 'platformGameUrl', 'isActive', 'displayOrder',
                'gameKey', 'botOffline', 'minWithdrawalLimit', 'maxWithdrawalLimit',
                'minDepositLimit', 'maxDepositLimit', 'depositDiscountPercent'
            ]
        });

        if (!game) {
            return sendError(res, 'Game not found', 404);
        }

        const gJson = game.toJSON();
        gJson.name = getStoreGameDisplayName(gJson.name, gJson.gameKey);
        if (isJuwaNewBotGame(gJson.name, game.gameKey) && !String(gJson.imageUrl || '').trim()) {
            const inherited = await findLegacyJuwaImageUrlForStore(storeCode);
            if (inherited) gJson.imageUrl = inherited;
        }
        if (isPandamasterNewBotGame(gJson.name, game.gameKey) && !String(gJson.imageUrl || '').trim()) {
            const inherited = await findLegacyPandamasterImageUrlForStore(storeCode);
            if (inherited) gJson.imageUrl = inherited;
        }
        gJson.isCustomManual = isCustomManualGame(gJson);
        gJson.botOffline = Boolean(gJson.botOffline);
        gJson.gameKey = gJson.gameKey || null;

        if (userId) {
            const account = await db.UserGameAccount.findOne({
                where: { userId, gameId: game.id },
                attributes: ['status', 'botUsername', 'botPassword']
            });

            if (account) {
                const isActive = account.status === 'active' || account.status === 'approved';
                if (isActive && !account.botUsername && !account.botPassword) {
                    gJson.has_account = false;
                    gJson.account_status = null;
                } else {
                    gJson.has_account = true;
                    gJson.account_status = account.status;
                    if (isActive) {
                        gJson.bot_username = account.botUsername;
                        gJson.bot_password = account.botPassword;
                        gJson.account_status = 'approved';
                    }
                }
            } else {
                gJson.has_account = false;
                gJson.account_status = null;
            }
        }

        sendSuccess(res, gJson);
    } catch (err) {
        sendError(res, err.message || 'Failed to get game details', err.statusCode || 500);
    }
}

/**
 * POST /api/games/:id/register
 * Register a game account for the current user. Requires auth token.
 */
async function register(req, res) {
    try {
        const gameId = parseId(req.params.id);
        if (!gameId) return sendError(res, 'Invalid game id', 400);

        const storeCode = req.user ? req.user.storeCode : null;

        // Verify user has access to this game (matches their storeCode or master games)
        const game = await db.Game.findOne({
            where: { id: gameId, isActive: true, addedByStoreCode: storeCode || null },
            attributes: ['id', 'name', 'gameKey', 'botApiKey', 'streamlitToken', 'agentId', 'addedByStoreCode']
        });

        if (!game) {
            return sendError(res, 'Game not found or you do not have access to it', 404);
        }

        let registerGameId = game.id;
        if (isOrionStarsGame(game) && !isOrionStarsBotAutomationGame(game)) {
            const storeGames = await db.Game.findAll({
                where: { isActive: true, addedByStoreCode: storeCode || null },
                attributes: ['id', 'name', 'gameKey', 'botApiKey', 'streamlitToken', 'agentId']
            });
            const botModeGame = storeGames.find((g) => isOrionStarsBotAutomationGame(g));
            if (botModeGame) registerGameId = botModeGame.id;
        }

        const data = await registerGameAccount(
            req.user.userId,
            req.user.username,
            registerGameId,
            { email: req.user.email }
        );
        sendSuccess(res, data, 201);
    } catch (err) {
        const status = (err.statusCode && err.statusCode !== 401 && err.statusCode !== 403) ? err.statusCode : 500;
        const message = err.message || 'Failed to register game account';
        sendError(res, message, status);
    }
}

/**
 * GET /api/games/:id/balance
 * Get current balance from game bot.
 */
async function balance(req, res) {
    try {
        const gameId = parseId(req.params.id);
        if (!gameId) {
            return sendError(res, 'Invalid game id', 400);
        }

        const data = await fetchGameBalance(req.user.userId, gameId);
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err.message || 'Failed to fetch game balance', err.statusCode || 500);
    }
}

/**
 * POST /api/games/:id/topup
 * Transfer funds from user wallet to the game bot.
 */
async function topup(req, res) {
    try {
        const gameId = parseId(req.params.id);
        const amount = Number(req.body.amount);

        if (!gameId) return sendError(res, 'Invalid game id', 400);
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) {
            return sendError(res, GAME_DEPOSIT_AMOUNT_ERROR, 400);
        }

        const result = await depositGameAccount(req.user.userId, gameId, amount);
        // return res.status(200).json(result); 
        // Format output as frontend expects
        sendSuccess(res, { message: result.message, message_extra: result.message });
    } catch (err) {
        const safe = sanitizeGameTransferError(err);
        sendError(res, safe.message, safe.statusCode, safe.code);
    }
}

/**
 * POST /api/games/:id/withdraw
 * Transfer funds from the game bot to the user wallet.
 */
async function withdraw(req, res) {
    try {
        const gameId = parseId(req.params.id);
        const amount = Number(req.body.amount);

        if (!gameId) return sendError(res, 'Invalid game id', 400);
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) {
            return sendError(res, GAME_WITHDRAW_AMOUNT_ERROR, 400);
        }

        const result = await withdrawGameAccount(req.user.userId, gameId, amount);
        sendSuccess(res, { message: result.message, message_extra: result.message, pending: result.pending === true });
    } catch (err) {
        const safe = sanitizeGameTransferError(err);
        sendError(res, safe.message, safe.statusCode, safe.code);
    }
}

/**
 * POST /api/games/:id/redeem
 * Redeem credits from game to user wallet. Same pattern as topup (gameId in URL).
 */
async function redeem(req, res) {
    try {
        const gameId = parseId(req.params.id);
        const amount = Number(req.body.amount);

        if (!gameId) return sendError(res, 'Invalid game id', 400);
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) {
            return sendError(res, GAME_WITHDRAW_AMOUNT_ERROR, 400);
        }

        const result = await redeemGameAccount(req.user.userId, gameId, amount);
        sendSuccess(res, { message: result.message, message_extra: result.message, pending: result.pending === true });
    } catch (err) {
        const safe = sanitizeGameTransferError(err);
        sendError(res, safe.message, safe.statusCode, safe.code);
    }
}

/**
 * GET /api/games/activities
 * List game activities (deposits, withdraws) for the user.
 */
async function activities(req, res) {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const acts = await db.GameActivity.findAll({
            where: { userId: req.user.userId },
            order: [['created_at', 'DESC']],
            limit
        });

        sendSuccess(res, { activities: acts.map(a => a.toJSON()) });
    } catch (err) {
        sendError(res, err.message || 'Failed to fetch activities', err.statusCode || 500);
    }
}

/**
 * POST /api/games/:id/sync-password
 * Verify Firekirin player password via queryInfo, persist it, return balance.
 */
async function syncPassword(req, res) {
    try {
        const gameId = parseId(req.params.id);
        if (!gameId) {
            return sendError(res, 'Invalid game id', 400);
        }

        const gamePassword =
            (typeof req.body?.gamePassword === 'string' && req.body.gamePassword) ||
            (typeof req.body?.password === 'string' && req.body.password) ||
            '';

        const game = await db.Game.findByPk(gameId);
        if (!game || !game.isActive) {
            return sendError(res, 'Game not found.', 404);
        }

        const isFirekirinAgent = isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game);
        const isMilkywayAgent = isMilkywayTerminalGame(game) && !isMilkywayBotAutomationGame(game);

        let data;
        if (isMilkywayAgent) {
            data = await syncMilkywayGamePassword(
                req.user.userId,
                gameId,
                gamePassword,
                req.user.storeCode || null
            );
        } else if (isFirekirinAgent) {
            data = await syncFirekirinGamePassword(
                req.user.userId,
                gameId,
                gamePassword,
                req.user.storeCode || null
            );
        } else {
            return sendError(res, 'Password sync is only supported for Firekirin or Milkyway agent games.', 400);
        }
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err.message || 'Failed to update game password', err.statusCode || 500, err.code || null);
    }
}

/**
 * GET /api/games/firekirin/exclusive
 * FireKirin Game API getgamelist for the logged-in store.
 */
async function firekirinExclusiveList(req, res) {
    try {
        const data = await getFirekirinExclusiveGames({
            storeCode: req.user?.storeCode || null,
            userId: req.user?.userId || null
        });
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err.message || 'Failed to load Firekirin games', err.statusCode || 500, err.code || null);
    }
}

/**
 * POST /api/games/firekirin/enter
 * FireKirin Game API entergame — returns webLoginUrl for a kindId.
 */
async function firekirinEnter(req, res) {
    try {
        const kindId = req.body?.kindId ?? req.body?.kind_id ?? req.body?.gameId;
        const data = await enterFirekirinExclusiveGame({
            userId: req.user.userId,
            storeCode: req.user?.storeCode || null,
            kindId,
            redirectUrl: typeof req.body?.redirectUrl === 'string' ? req.body.redirectUrl : ''
        });
        sendSuccess(res, { url: data.url });
    } catch (err) {
        sendError(res, err.message || 'Failed to launch Firekirin game', err.statusCode || 500, err.code || null);
    }
}

/**
 * GET /api/games/milkyway/exclusive
 * Milkyway Game API getgamelist for the logged-in store.
 */
async function milkywayExclusiveList(req, res) {
    try {
        const data = await getMilkywayExclusiveGames({
            storeCode: req.user?.storeCode || null,
            userId: req.user?.userId || null
        });
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err.message || 'Failed to load Milkyway games', err.statusCode || 500, err.code || null);
    }
}

/**
 * POST /api/games/milkyway/enter
 * Milkyway Game API entergame — returns webLoginUrl for a kindId.
 */
async function milkywayEnter(req, res) {
    try {
        const kindId = req.body?.kindId ?? req.body?.kind_id ?? req.body?.gameId;
        const data = await enterMilkywayExclusiveGame({
            userId: req.user.userId,
            storeCode: req.user?.storeCode || null,
            kindId,
            redirectUrl: typeof req.body?.redirectUrl === 'string' ? req.body.redirectUrl : ''
        });
        sendSuccess(res, { url: data.url });
    } catch (err) {
        sendError(res, err.message || 'Failed to launch Milkyway game', err.statusCode || 500, err.code || null);
    }
}

module.exports = {
    list,
    get,
    register,
    balance,
    syncPassword,
    topup,
    withdraw,
    redeem,
    activities,
    playEligibility,
    firekirinExclusiveList,
    firekirinEnter,
    milkywayExclusiveList,
    milkywayEnter
};
