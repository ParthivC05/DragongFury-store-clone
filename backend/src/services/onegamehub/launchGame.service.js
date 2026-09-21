'use strict';

const db = require('../../db/models');
const { assertUserCanPlayGames } = require('../games/gamePlayEligibility.service');
const { fetchRealPlay } = require('./onegamehub.client');
const { isOneGameHubLaunchConfigured } = require('./onegamehub.config');
const { HUB_CURRENCY, isBlockedBrand } = require('./onegamehub.constants');
const { isHiddenBrokenProviderGame } = require('../../constants/hiddenBrokenGames');
const { createSession } = require('./callbacks/session.service');

/**
 * Launch a 1GameHub real-money game (SC / SSC only).
 * Body: { gameid: string }i don't 
 */
async function launchGame(req) {
  const userId = req.user && req.user.userId != null ? Number(req.user.userId) : null;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  let storeCode = req.user.storeCode || '';
  if (!storeCode) {
    const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
    storeCode = user?.storeCode || '';
  }

  if (!isOneGameHubLaunchConfigured(storeCode)) {
    const err = new Error('1GameHub launch is not configured');
    err.statusCode = 503;
    throw err;
  }

  await assertUserCanPlayGames(userId);

  const gameId = String(req.body?.gameid ?? req.body?.gameId ?? req.body?.id ?? '').trim();
  if (!gameId) {
    const err = new Error('Invalid game id');
    err.statusCode = 400;
    throw err;
  }

  if (isBlockedBrand(gameId) || isHiddenBrokenProviderGame(gameId)) {
    const err = new Error('This game is not available');
    err.statusCode = 404;
    throw err;
  }

  const session = await createSession({ userId, storeCode, gameId, currency: HUB_CURRENCY });
  const launched = await fetchRealPlay({
    gameId,
    playerId: session.playerId,
    currency: HUB_CURRENCY,
    storeCode
  });

  return {
    url: launched.url,
    message: 'OK',
    provider: 'onegamehub',
    mode: 'seamless',
    gameId,
    currency: 'SC'
  };
}

module.exports = { launchGame };
