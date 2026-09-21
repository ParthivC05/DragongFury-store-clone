'use strict';

const db = require('../../db/models');
const { assertUserCanPlayGames } = require('../games/gamePlayEligibility.service');
const { fetchRealPlay } = require('./onegamehub.client');
const { isOneGameHubLaunchConfigured } = require('./onegamehub.config');
const { isBlockedBrand } = require('./onegamehub.constants');
const { createSession } = require('./callbacks/session.service');
const { parseCoinTypeFromReq, hubCurrencyForCoin } = require('../../lib/normalizePlayCoinType');
const { rememberPlayCoin } = require('../playCoin/playCoinSession.service');
const { isGcCoinsStore } = require('../../constants/gcCoins');

/**
 * Launch a 1GameHub real-money game (SSC for SC, GOC for DragonFury GC).
 * Body: { gameid: string, coinType?: 'SC' | 'GC' }
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

  if (isBlockedBrand(gameId)) {
    const err = new Error('This game is not available');
    err.statusCode = 404;
    throw err;
  }

  let coinType = parseCoinTypeFromReq(req, 'onegamehub');
  if (coinType === 'GC' && !isGcCoinsStore(storeCode)) coinType = 'SC';
  const hubCurrency = hubCurrencyForCoin(coinType);
  const session = await createSession({ userId, storeCode, gameId, currency: hubCurrency });
  await rememberPlayCoin({ userId, provider: 'onegamehub', gameId, coinType });
  const launched = await fetchRealPlay({
    gameId,
    playerId: session.playerId,
    currency: hubCurrency,
    storeCode
  });

  return {
    url: launched.url,
    message: 'OK',
    provider: 'onegamehub',
    mode: 'seamless',
    gameId,
    currency: coinType
  };
}

module.exports = { launchGame };
