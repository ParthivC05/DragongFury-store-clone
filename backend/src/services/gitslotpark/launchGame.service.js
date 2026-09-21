'use strict';

const { request } = require('./client');
const { isGitslotparkLaunchConfigured, resolveGitslotparkConfig } = require('./gitslotpark.config');
const { buildGitslotparkUserId } = require('./gitslotparkUserId.helpers');
const { upsertGitslotparkUserMapping } = require('./callbacks/resolveGitslotparkUser.service');
const { assertUserCanPlayGames } = require('../games/gamePlayEligibility.service');
const { parseCoinTypeFromReq } = require('../../lib/normalizePlayCoinType');
const { rememberPlayCoin } = require('../playCoin/playCoinSession.service');

/**
 * Launch a GitSlotPark game session and return the playable URL.
 * @param {import('express').Request} req
 * @returns {Promise<{ url: string, message: string }>}
 */
async function launchGame(req) {
  if (!isGitslotparkLaunchConfigured(req)) {
    const err = new Error('GitSlotPark launch is not configured');
    err.statusCode = 503;
    throw err;
  }

  const userId = req.user && req.user.userId != null ? req.user.userId : null;
  const username = req.user && req.user.username ? String(req.user.username).trim() : '';
  if (!userId && !username) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const gitslotparkUserId = buildGitslotparkUserId(username, userId);
  if (!gitslotparkUserId) {
    const err = new Error('Unable to build a valid game user id for this account');
    err.statusCode = 400;
    throw err;
  }

  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  await assertUserCanPlayGames(userId);

  const gameid = parseInt(req.body && req.body.gameid, 10);
  if (!Number.isFinite(gameid) || gameid < 1) {
    const err = new Error('Invalid game id');
    err.statusCode = 400;
    throw err;
  }

  const { agentId, lobbyUrl } = resolveGitslotparkConfig(req);

  const payload = await request(req, 'POST', '/userAuth', {
    body: {
      agentID: agentId,
      userID: gitslotparkUserId,
      lang: 'en',
      gameid,
      isaffiliate: false,
      lobbyUrl
    }
  });

  const code = payload && payload.code;
  const message = (payload && payload.message) || 'OK';

  if (code !== 0) {
    const err = new Error(message || 'Failed to launch GitSlotPark game');
    err.statusCode = 502;
    err.response = payload;
    throw err;
  }

  const url = payload && typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!url) {
    const err = new Error('Game launch URL not returned');
    err.statusCode = 502;
    throw err;
  }

  await upsertGitslotparkUserMapping(userId, gitslotparkUserId);
  await rememberPlayCoin({
    userId,
    provider: 'gitslotpark',
    gameId: gameid,
    coinType: parseCoinTypeFromReq(req, 'gitslotpark')
  });

  return { url, message };
}

module.exports = { launchGame };
