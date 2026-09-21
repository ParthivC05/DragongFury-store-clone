'use strict';

const { assertUserCanPlayGames } = require('../games/gamePlayEligibility.service');
const { isBonaLaunchConfigured, resolveBonaConfig } = require('./bona.config');
const bonaClient = require('./bona.client');
const {
  buildBonaUsername,
  toBase64Url,
  upsertBonaUserMapping
} = require('./bonaUser.helpers');
const { getPlayableBalance } = require('./bonaWallet.helpers');
const { parseCoinTypeFromReq } = require('../../lib/normalizePlayCoinType');
const { rememberPlayCoin } = require('../playCoin/playCoinSession.service');

/**
 * Launch a Bona game in Seamless Wallet mode:
 * createAccount → login → openGame (SC stays on platform; Bona calls Query/Bet/Settlement).
 */
async function launchGame(req) {
  if (!isBonaLaunchConfigured()) {
    const err = new Error('Bona Games launch is not configured');
    err.statusCode = 503;
    throw err;
  }

  const userId = req.user && req.user.userId != null ? req.user.userId : null;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  await assertUserCanPlayGames(userId);

  const gameId = parseInt(req.body && (req.body.gameid ?? req.body.gameId ?? req.body.id), 10);
  if (!Number.isFinite(gameId) || gameId < 1) {
    const err = new Error('Invalid game id');
    err.statusCode = 400;
    throw err;
  }

  const coinType = parseCoinTypeFromReq(req, 'bona');
  await rememberPlayCoin({ userId, provider: 'bona', gameId, coinType });
  const playable = await getPlayableBalance(userId, undefined, coinType);
  if (!(playable > 0)) {
    const err = new Error(
      coinType === 'GC'
        ? 'Insufficient Gold Coin balance to launch this game'
        : 'Insufficient SC balance to launch this game'
    );
    err.statusCode = 400;
    err.code = 'INSUFFICIENT_FUNDS';
    throw err;
  }

  const { currency, homeUrl, lang } = resolveBonaConfig();
  const bonaUsername = buildBonaUsername(userId);
  if (!bonaUsername) {
    const err = new Error('Unable to build Bona username for this account');
    err.statusCode = 400;
    throw err;
  }

  const createPayload = await bonaClient.createAccount(bonaUsername);
  const bonaUid =
    createPayload?.data?.uid != null
      ? String(createPayload.data.uid)
      : createPayload?.alreadyExists
        ? null
        : null;

  const mapping = await upsertBonaUserMapping(userId, bonaUsername, { bonaUid });

  const loginPayload = await bonaClient.playerLogin(bonaUsername, currency);
  const token = loginPayload?.data?.token;
  if (!token) {
    const err = new Error('Bona login did not return a token');
    err.statusCode = 502;
    throw err;
  }

  if (mapping && typeof mapping.update === 'function') {
    const updates = { lastToken: String(token), walletMode: 2 };
    if (bonaUid && !mapping.bonaUid) updates.bonaUid = bonaUid;
    // If create returned alreadyExists without uid, try to keep existing uid
    await mapping.update(updates);
  }

  const origin =
    homeUrl ||
    (req.get && req.get('origin')) ||
    (req.headers && req.headers.origin) ||
    '';
  const backTarget = String(origin || 'https://example.com/').replace(/\/?$/, '/');
  const back = toBase64Url(backTarget);

  const { url } = await bonaClient.openGame({
    token,
    gameId,
    back,
    lang,
    closeBack: '0',
    currency
  });

  return {
    url,
    message: 'OK',
    provider: 'bona',
    mode: 'seamless',
    gameId,
    bonaUsername
  };
}

module.exports = { launchGame };
