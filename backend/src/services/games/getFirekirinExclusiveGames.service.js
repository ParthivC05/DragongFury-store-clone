'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const {
  isFirekirinGame,
  isFirekirinTerminalGame,
  isFirekirinBotAutomationGame
} = require('../../utils/gameIntegration.helpers');
const {
  getFirekirinGameList,
  enterFirekirinGame,
  isFirekirinInvalidPlayerPasswordError
} = require('./firekirin.helpers');

const LIST_CACHE_TTL_MS = 10 * 60 * 1000;
const listCache = new Map();
const listInflight = new Map();

const FIREKIRIN_GAME_ATTRIBUTES = [
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

function isUsableFirekirinAccount(account) {
  if (!account) return false;
  const status = String(account.status || '').trim().toLowerCase();
  if (status && status !== 'active' && status !== 'approved') return false;
  return Boolean(String(account.botUsername || '').trim() && String(account.botPassword || '').trim());
}

async function findStoreFirekirinAgentGame(storeCode) {
  const code = String(storeCode || '').trim() || null;
  const games = await db.Game.findAll({
    where: {
      isActive: true,
      addedByStoreCode: code
    },
    attributes: FIREKIRIN_GAME_ATTRIBUTES,
    order: [['displayOrder', 'ASC'], ['id', 'ASC']]
  });

  const firekirinGames = games.filter((g) => isFirekirinGame(g) && g.botUsername && g.botPassword);
  const agent = firekirinGames.find(
    (g) => isFirekirinTerminalGame(g) && !isFirekirinBotAutomationGame(g)
  );
  return agent || firekirinGames[0] || null;
}

async function loadExclusiveList(game) {
  const key = listCacheKey(game.addedByStoreCode, game.id);
  const cached = listCache.get(key);
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) {
    return cached.games;
  }
  if (listInflight.has(key)) return listInflight.get(key);

  const promise = getFirekirinGameList(game)
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

async function getFirekirinExclusiveGames({ storeCode, userId } = {}) {
  const game = await findStoreFirekirinAgentGame(storeCode);
  if (!game) {
    return { games: [], firekirinGameId: null, hasAccount: false };
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
    hasAccount = isUsableFirekirinAccount(account);
  }

  try {
    const games = await loadExclusiveList(game);
    return {
      games,
      firekirinGameId: game.id,
      hasAccount
    };
  } catch (err) {
    console.error('[Firekirin] getgamelist failed', {
      gameId: game.id,
      storeCode,
      message: err.message
    });
    return { games: [], firekirinGameId: game.id, hasAccount };
  }
}

async function enterFirekirinExclusiveGame({ userId, storeCode, kindId, redirectUrl } = {}) {
  const kind = String(kindId || '').trim();
  if (!kind) {
    const err = new Error('Game id is required.');
    err.statusCode = 400;
    throw err;
  }

  const game = await findStoreFirekirinAgentGame(storeCode);
  if (!game) {
    const err = new Error('Firekirin is not available for this store.');
    err.statusCode = 404;
    err.code = 'FIREKIRIN_NOT_CONFIGURED';
    throw err;
  }

  const userGameAccount = await db.UserGameAccount.findOne({
    where: {
      userId,
      gameId: game.id,
      status: { [Op.in]: ['active', 'approved'] }
    }
  });

  if (!isUsableFirekirinAccount(userGameAccount)) {
    const err = new Error('Create or link your Firekirin account first, then try this game.');
    err.statusCode = 400;
    err.code = 'FIREKIRIN_ACCOUNT_REQUIRED';
    throw err;
  }

  try {
    return await enterFirekirinGame(
      game,
      userGameAccount.botUsername,
      userGameAccount.botPassword,
      kind,
      redirectUrl
    );
  } catch (err) {
    if (isFirekirinInvalidPlayerPasswordError(err)) {
      const stale = new Error('Your Firekirin password has changed. Please update your password, then try again.');
      stale.statusCode = 400;
      stale.code = 'GAME_PASSWORD_STALE';
      throw stale;
    }
    throw err;
  }
}

module.exports = {
  getFirekirinExclusiveGames,
  enterFirekirinExclusiveGame,
  findStoreFirekirinAgentGame
};
