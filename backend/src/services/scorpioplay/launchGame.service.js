'use strict';

const config = require('../../configs/app.config');
const { assertUserCanPlayGames } = require('../games/gamePlayEligibility.service');
const { isScorpioConfigured, resolveScorpioConfig, buildPlayerExternalId } = require('./scorpio.config');
const client = require('./scorpio.client');
const { upsertScorpioPlayer } = require('./scorpioUser.helpers');
const { createLogger } = require('../../libs/logger');

const log = createLogger('scorpio');

function pickGameUrl(payload) {
  const data = payload && payload.data && typeof payload.data === 'object' ? payload.data : payload;
  if (!data || typeof data !== 'object') return '';
  return String(
    data.gameUrl
    || data.url
    || data.launchUrl
    || data.gameURL
    || ''
  ).trim();
}

function pickPlayerCode(payload) {
  const data = payload && payload.data && typeof payload.data === 'object' ? payload.data : payload;
  if (!data || typeof data !== 'object') return null;
  const code = data.playerCode ?? data.player_code ?? data.code;
  const num = Number(code);
  return Number.isFinite(num) ? num : (code != null && code !== '' ? code : null);
}

/** Keep in sync with frontend/src/config/scorpio.js */
const SCORPIO_GAMES_SLUG = 'p9w4x7c2jm';

function frontendReturnUrl(req) {
  let raw = '';
  try {
    raw = String(config.get('email.frontendUrl') || '').split(',')[0].trim();
  } catch (_err) {
    raw = '';
  }
  if (!raw && req) {
    const origin = String(req.get('origin') || '').trim();
    if (origin) {
      try {
        raw = new URL(origin).origin;
      } catch (_err) {
        raw = '';
      }
    }
  }
  raw = raw.replace(/\/+$/, '');
  return raw ? `${raw}/${SCORPIO_GAMES_SLUG}` : '';
}

async function ensurePlayer(userId) {
  const playerExternalId = buildPlayerExternalId(userId);
  if (!playerExternalId) {
    const err = new Error('Unable to build a Scorpio Play player id for this account');
    err.statusCode = 400;
    throw err;
  }

  const created = await client.createPlayer(playerExternalId);
  let playerCode = pickPlayerCode(created);
  if (!client.isSuccess(created) && !client.isAlreadyExists(created) && playerCode == null) {
    try {
      const info = await client.getPlayerInfo(playerExternalId);
      playerCode = pickPlayerCode(info);
      if (!client.isSuccess(info) && playerCode == null) {
        const err = new Error(client.errorMessage(created) || 'Failed to register Scorpio Play player');
        err.statusCode = 502;
        err.response = created;
        throw err;
      }
    } catch (err) {
      if (!err.statusCode) {
        err.statusCode = 502;
      }
      if (!client.isAlreadyExists(created)) throw err;
    }
  }

  await upsertScorpioPlayer(userId, { playerExternalId, playerCode });
  return { playerExternalId, playerCode };
}

async function launchGame(req) {
  if (!isScorpioConfigured()) {
    const err = new Error('Scorpio Play launch is not configured');
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

  const body = req.body || {};
  const gameCode = String(body.gameCode || body.gameid || body.gameId || '').trim();
  const providerId = Number(body.providerId ?? body.gpid ?? body.gpId);
  if (!gameCode) {
    const err = new Error('gameCode is required');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(providerId) || providerId <= 0) {
    const err = new Error('providerId is required');
    err.statusCode = 400;
    throw err;
  }

  const { playerExternalId } = await ensurePlayer(userId);
  const { lang, currency, rtp } = resolveScorpioConfig();
  const returnUrl = String(body.returnUrl || frontendReturnUrl(req) || '').trim();

  const payload = await client.launchGame({
    playerExternalId,
    providerId,
    gameCode,
    language: lang,
    currency,
    returnUrl: returnUrl || undefined,
    rtp
  });

  if (!client.isSuccess(payload)) {
    const err = new Error(client.errorMessage(payload) || 'Failed to launch Scorpio Play game');
    err.statusCode = 502;
    err.response = payload;
    log.warn('Scorpio Play launch failed', {
      message: err.message,
      playerExternalId,
      providerId,
      gameCode
    });
    throw err;
  }

  const url = pickGameUrl(payload);
  if (!url) {
    const err = new Error('Scorpio Play did not return a game URL');
    err.statusCode = 502;
    throw err;
  }

  return {
    url,
    message: 'OK',
    provider: 'scorpio',
    mode: 'seamless',
    gameCode,
    providerId,
    playerExternalId
  };
}

module.exports = { launchGame, ensurePlayer };
