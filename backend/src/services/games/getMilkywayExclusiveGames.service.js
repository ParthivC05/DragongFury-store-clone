'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const {
  isMilkywayGame,
  isMilkywayTerminalGame,
  isMilkywayBotAutomationGame
} = require('../../utils/gameIntegration.helpers');
const {
  getMilkywayGameList,
  enterMilkywayGame,
  isMilkywayInvalidPlayerPasswordError
} = require('./milkyway.helpers');

const LIST_CACHE_TTL_MS = 10 * 60 * 1000;
const listCache = new Map();
const listInflight = new Map();

const MILKYWAY_GAME_ATTRIBUTES = [
  'id',
  'name',
  'gameKey',
  'botUsername',
  'botPassword',
  'botApiUrl',
  'gameTemplateId',
  'agentId',
  'isActive',
  'addedByStoreCode'
];

function listCacheKey(storeCode, gameId) {
  return `${String(storeCode || '').trim() || 'none'}:${gameId}`;
}

function isUsableMilkywayAccount(account) {
  if (!account) return false;
  const status = String(account.status || '').trim().toLowerCase();
  if (status && status !== 'active' && status !== 'approved') return false;
  return Boolean(String(account.botUsername || '').trim() && String(account.botPassword || '').trim());
}

async function findStoreMilkywayAgentGame(storeCode) {
  const code = String(storeCode || '').trim() || null;
  const games = await db.Game.findAll({
    where: {
      isActive: true,
      addedByStoreCode: code
    },
    attributes: MILKYWAY_GAME_ATTRIBUTES,
    order: [['displayOrder', 'ASC'], ['id', 'ASC']]
  });

  const milkywayGames = games.filter((g) => isMilkywayGame(g) && g.botUsername && g.botPassword);
  const agent = milkywayGames.find(
    (g) => isMilkywayTerminalGame(g) && !isMilkywayBotAutomationGame(g)
  );
  return agent || milkywayGames[0] || null;
}

async function loadExclusiveList(game) {
  const key = listCacheKey(game.addedByStoreCode, game.id);
  const cached = listCache.get(key);
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) {
    return cached.games;
  }
  if (listInflight.has(key)) return listInflight.get(key);

  const promise = getMilkywayGameList(game)
    .then((games) => {
      listCache.set(key, { at: Date.now(), games });
      return games;
    })
    .finally(() => {
      listInflight.delete(key);
    });

  listInflight.set(key, promise);
  return promise;
}

async function getMilkywayExclusiveGames({ storeCode, userId } = {}) {
  const game = await findStoreMilkywayAgentGame(storeCode);
  if (!game) {
    return { games: [], milkywayGameId: null, hasAccount: false };
  }

  let hasAccount = false;
  if (userId) {
    const account = await db.UserGameAccount.findOne({
      where: {
        userId,
        gameId: game.id,
        status: { [Op.in]: ['active', 'approved'] }
      },
      attributes: ['botUsername', 'botPassword', 'status']
    });
    hasAccount = isUsableMilkywayAccount(account);
  }

  try {
    const games = await loadExclusiveList(game);
    return {
      games,
      milkywayGameId: game.id,
      hasAccount
    };
  } catch (err) {
    console.error('[Milkyway] getgamelist failed', {
      gameId: game.id,
      storeCode,
      message: err.message
    });
    return { games: [], milkywayGameId: game.id, hasAccount };
  }
}

async function enterMilkywayExclusiveGame({ userId, storeCode, kindId, redirectUrl } = {}) {
  const kind = String(kindId || '').trim();
  if (!kind) {
    const err = new Error('Game id is required.');
    err.statusCode = 400;
    throw err;
  }

  const game = await findStoreMilkywayAgentGame(storeCode);
  if (!game) {
    const err = new Error('Milkyway is not available for this store.');
    err.statusCode = 404;
    err.code = 'MILKYWAY_NOT_CONFIGURED';
    throw err;
  }

  const userGameAccount = await db.UserGameAccount.findOne({
    where: {
      userId,
      gameId: game.id,
      status: { [Op.in]: ['active', 'approved'] }
    }
  });

  if (!isUsableMilkywayAccount(userGameAccount)) {
    const err = new Error('Create or link your Milkyway account first, then try this game.');
    err.statusCode = 400;
    err.code = 'MILKYWAY_ACCOUNT_REQUIRED';
    throw err;
  }

  try {
    return await enterMilkywayGame(
      game,
      userGameAccount.botUsername,
      userGameAccount.botPassword,
      kind,
      redirectUrl
    );
  } catch (err) {
    if (isMilkywayInvalidPlayerPasswordError(err)) {
      const stale = new Error('Your Milkyway password has changed. Please update your password, then try again.');
      stale.statusCode = 400;
      stale.code = 'GAME_PASSWORD_STALE';
      throw stale;
    }
    throw err;
  }
}

module.exports = {
  getMilkywayExclusiveGames,
  enterMilkywayExclusiveGame,
  findStoreMilkywayAgentGame
};
