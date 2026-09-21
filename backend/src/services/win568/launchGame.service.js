'use strict';

const { assertUserCanPlayGames } = require('../games/gamePlayEligibility.service');
const { isWin568LaunchConfigured, resolveWin568Config } = require('./win568.config');
const client = require('./win568.client');
const { getGamesList } = require('./getGamesList.service');
const { buildWin568Username, upsertWin568Player } = require('./win568User.helpers');
const { createLogger } = require('../../libs/logger');
const { parseCoinTypeFromReq } = require('../../lib/normalizePlayCoinType');
const { rememberPlayCoin } = require('../playCoin/playCoinSession.service');

const log = createLogger('win568');

const LOBBY_GPID = 10000;
const GAMES_LOBBY_GAMEID = 0;
const DEFAULT_PORTFOLIO = 'SeamlessGame';
/** Support: SBO Slot = 3.2.1 New Login, GpId 14, Portfolio SeamlessGame. */
const SBO_SLOT_GPID = 14;
const LEGACY_SBO_SLOT_GPID = 1;

const PORTFOLIO_BY_GPID = {
  1015: 'ThirdPartySportsBook'
};

const LOBBY_GPIDS = new Set([1, 14, 16, 1029, 1016, 1015, 10000]);
const SEAMLESS_PORTFOLIOS = new Set(['SeamlessGame', 'ThirdPartySportsBook']);

/** 3.6 SBO Game — desktop vs mobile IDs (6101 desktop is InvalidRequest on mobile). */
const SBO_GAMES_MOBILE_BY_DESKTOP = {
  6101: 602801,
  6102: 602802,
  6103: 602803,
  6104: 602804,
  6105: 602805,
  6106: 602811
};
const SBO_GAMES_DESKTOP_BY_MOBILE = Object.fromEntries(
  Object.entries(SBO_GAMES_MOBILE_BY_DESKTOP).map(([desktop, mobile]) => [mobile, Number(desktop)])
);

const PORTFOLIOS = new Set([
  'SportsBook',
  'Casino',
  'Games',
  'VirtualSports',
  'SeamlessGame',
  'ThirdPartySportsBook',
  '568WinSportsbook',
  'SboLive'
]);

function normalizePortfolio(raw) {
  const value = String(raw || '').trim();
  if (!value) return DEFAULT_PORTFOLIO;
  const match = [...PORTFOLIOS].find((name) => name.toLowerCase() === value.toLowerCase());
  return match || DEFAULT_PORTFOLIO;
}

function pickLoginField(payload, ...names) {
  if (!payload || typeof payload !== 'object') return '';
  const map = {};
  for (const key of Object.keys(payload)) {
    map[String(key).toLowerCase()] = payload[key];
  }
  for (const name of names) {
    const value = map[String(name).toLowerCase()];
    if (value != null && value !== '') return String(value).trim();
  }
  return '';
}

function deviceFromReq(req) {
  const bodyDevice = req.body && (req.body.device || req.body.Device);
  if (bodyDevice === 'm' || bodyDevice === 'd') return bodyDevice;
  const ua = String((req.headers && req.headers['user-agent']) || '').toLowerCase();
  return /mobile|android|iphone|ipad/.test(ua) ? 'm' : 'd';
}

function parseOptionalInt(raw) {
  if (raw == null || raw === '') return null;
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) ? value : null;
}

function parseGameIds(body) {
  return {
    gpid: parseOptionalInt(body && (body.gpid ?? body.gpId ?? body.providerId)),
    gameid: parseOptionalInt(body && (body.gameid ?? body.gameId ?? body.id)),
    portfolio: normalizePortfolio(body && (body.portfolio || body.Portfolio))
  };
}

function resolveSboGamesId(gameid, device) {
  const id = Number(gameid);
  if (!Number.isFinite(id) || id <= 0) return device === 'm' ? 602801 : 6101;
  if (device === 'm') return SBO_GAMES_MOBILE_BY_DESKTOP[id] || id;
  return SBO_GAMES_DESKTOP_BY_MOBILE[id] || id;
}

async function resolveLaunchIds(body, device) {
  const parsed = parseGameIds(body);
  let { gpid, gameid, portfolio } = parsed;

  // WanMei (and some other tables) use gameProviderId 0. Never coerce 0 → 10000.
  // If the client sent aggregator lobby 10000 with a real table id, use the catalog gpId.
  const needsCatalogGp = SEAMLESS_PORTFOLIOS.has(portfolio)
    && gameid != null
    && gameid > 1
    && (gpid == null || gpid === LOBBY_GPID);
  if (needsCatalogGp) {
    try {
      const data = await getGamesList();
      const match = (data.games || []).find((game) => Number(game.gameId) === gameid);
      if (match && match.gpId != null && match.gpId !== '') {
        const catalogGp = Number(match.gpId);
        if (Number.isFinite(catalogGp)) {
          gpid = catalogGp;
        }
      }
    } catch (err) {
      log.warn('568Win game-list lookup for launch gpid failed', { message: err.message });
    }
  }

  if (gameid == null) gameid = GAMES_LOBBY_GAMEID;
  if (gpid == null) gpid = LOBBY_GPID;
  // Old catalog used gpId 1 for this tile; support confirmed SBO Slot is 14.
  if (portfolio === 'SeamlessGame' && gpid === LEGACY_SBO_SLOT_GPID && (gameid === 0 || gameid === LEGACY_SBO_SLOT_GPID)) {
    gpid = SBO_SLOT_GPID;
    gameid = GAMES_LOBBY_GAMEID;
  }
  if (portfolio === DEFAULT_PORTFOLIO && PORTFOLIO_BY_GPID[gpid]) {
    portfolio = PORTFOLIO_BY_GPID[gpid];
  }
  if (portfolio === 'ThirdPartySportsBook' && gpid === 1015 && gameid === 1) {
    gameid = GAMES_LOBBY_GAMEID;
  }
  if (gpid != null && gameid === gpid && LOBBY_GPIDS.has(gpid)) {
    gameid = GAMES_LOBBY_GAMEID;
  }
  if (portfolio === 'Games') {
    gameid = resolveSboGamesId(gameid, device);
  }
  return { gpid, gameid, portfolio };
}

function ensureHttps(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, '')}`;
}

/** Demo iframe host gp-winfast888 does not exist. Keep the login host gp.winfast888 (3.8). */
function undoBrokenGpIframeHost(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  try {
    const parsed = new URL(ensureHttps(value));
    if (parsed.hostname.toLowerCase() === 'gp-winfast888.ggppqqgg.com') {
      parsed.hostname = 'gp.winfast888.ggppqqgg.com';
    }
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch (_err) {
    return value.replace(/\/\/gp-winfast888\./gi, '//gp.winfast888.');
  }
}

/**
 * 3.2.1 returns a one-time URL. Append portfolio params from 3.3–3.8.
 */
function buildLaunchUrl({
  loginUrl,
  token,
  gpid,
  gameid,
  lang,
  device,
  currency,
  portfolio,
  fallbackHost
}) {
  let base = ensureHttps(loginUrl);
  if (!base && token && fallbackHost) {
    const host = ensureHttps(fallbackHost).replace(/\/+$/, '');
    base = `${host}/Game/Welcome?token=${encodeURIComponent(token)}`;
  }
  if (!base) return '';

  let parsed;
  try {
    parsed = new URL(base);
  } catch (_err) {
    return '';
  }

  if (token && !parsed.searchParams.get('token')) {
    parsed.searchParams.set('token', token);
  }

  const kind = normalizePortfolio(portfolio);
  const deviceCode = device || 'd';
  const langCode = lang || 'en';

  if (kind === 'SportsBook' || kind === '568WinSportsbook') {
    parsed.searchParams.set('lang', langCode);
    parsed.searchParams.set('oddstyle', 'MY');
    parsed.searchParams.set('oddsmode', 'double');
    parsed.searchParams.set('device', deviceCode);
    if (kind === 'SportsBook') parsed.searchParams.set('theme', 'SboMain');
  } else if (kind === 'Casino') {
    parsed.searchParams.set('locale', langCode);
    parsed.searchParams.set('device', deviceCode);
    parsed.searchParams.set('productId', String(gameid > 0 ? gameid : 0));
  } else if (kind === 'Games') {
    // 3.6: append gameId only. rng. → rng- for iframe (official reminder).
    parsed.searchParams.delete('gpid');
    parsed.searchParams.delete('gameid');
    parsed.searchParams.delete('device');
    parsed.searchParams.delete('currency');
    parsed.searchParams.set('gameId', String(gameid > 0 ? gameid : (deviceCode === 'm' ? 602801 : 6101)));
    if (parsed.hostname.startsWith('rng.') && !parsed.hostname.startsWith('rng-')) {
      parsed.hostname = `rng-${parsed.hostname.slice(4)}`;
    }
  } else if (kind === 'VirtualSports') {
    parsed.searchParams.set('lang', langCode);
  } else {
    // 3.8: use {response-url}. SBO Slot 3.2.1 already returns CreativeGamingLobby — do not rewrite to /Game/Welcome.
    parsed.protocol = 'https:';
    if (parsed.hostname.toLowerCase() === 'gp-winfast888.ggppqqgg.com') {
      parsed.hostname = 'gp.winfast888.ggppqqgg.com';
    }
    if (Number(gpid) === SBO_SLOT_GPID || Number(gpid) === LEGACY_SBO_SLOT_GPID) {
      return parsed.toString();
    }
    parsed.searchParams.set('gpid', String(gpid));
    parsed.searchParams.set('gameid', String(gameid));
    parsed.searchParams.set('lang', langCode);
    parsed.searchParams.set('device', deviceCode);
  }
  return parsed.toString();
}

async function ensureRegistered(userId, username) {
  const { agentUsername, currency } = resolveWin568Config();
  const win568Username = buildWin568Username(userId, username);
  if (!win568Username) {
    const err = new Error('Unable to build a valid 568Win username for this account');
    err.statusCode = 400;
    throw err;
  }
  if (!agentUsername) {
    const err = new Error('568Win agent username is not configured');
    err.statusCode = 503;
    throw err;
  }

  await upsertWin568Player(userId, win568Username);

  const payload = await client.registerPlayer({
    username: win568Username,
    agent: agentUsername,
    currency: currency || 'USD'
  });

  if (!client.isNoError(payload) && !client.isAlreadyExists(payload)) {
    const err = new Error(client.errorMsg(payload) || 'Failed to register 568Win player');
    err.statusCode = 502;
    err.response = payload;
    log.warn('568Win register-player failed', {
      errorId: client.errorId(payload),
      errorMsg: client.errorMsg(payload),
      username: win568Username
    });
    throw err;
  }

  await upsertWin568Player(userId, win568Username);
  return win568Username;
}

/**
 * Register the platform user on 568Win (3.1) if needed, then login (3.2.1)
 * and return a welcome URL for the requested portfolio.
 */
async function launchGame(req) {
  if (!isWin568LaunchConfigured()) {
    const err = new Error('568Win launch is not configured');
    err.statusCode = 503;
    throw err;
  }

  const userId = req.user && req.user.userId != null ? req.user.userId : null;
  const username = req.user && req.user.username ? String(req.user.username).trim() : '';
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  await assertUserCanPlayGames(userId);

  const win568Username = await ensureRegistered(userId, username);
  const { lang, gameProviderUrl, currency } = resolveWin568Config();
  const device = deviceFromReq(req);
  const { gpid, gameid, portfolio } = await resolveLaunchIds(req.body || {}, device);
  await rememberPlayCoin({
    userId,
    provider: 'win568',
    gameId: gameid,
    coinType: parseCoinTypeFromReq(req, 'win568')
  });
  const loginPayload = await client.loginPlayer({
    username: win568Username,
    portfolio,
    lang: lang || 'en',
    device,
    oddStyle: 'MY',
    gpid,
    gameid
  });

  if (!client.isNoError(loginPayload)) {
    const err = new Error(client.errorMsg(loginPayload) || 'Failed to login 568Win player');
    err.statusCode = 502;
    err.response = loginPayload;
    log.warn('568Win login failed', {
      errorId: client.errorId(loginPayload),
      errorMsg: client.errorMsg(loginPayload),
      username: win568Username,
      portfolio
    });
    throw err;
  }

  const loginUrl = pickLoginField(loginPayload, 'url');
  const token = pickLoginField(loginPayload, 'token');
  if (!loginUrl && !token) {
    const err = new Error('568Win login did not return a url or token');
    err.statusCode = 502;
    throw err;
  }

  log.info('568Win 3.2.1 login', {
    username: win568Username,
    portfolio,
    gpid,
    gameid,
    errorId: client.errorId(loginPayload),
    loginUrl
  });

  const url = undoBrokenGpIframeHost(buildLaunchUrl({
    loginUrl,
    token,
    gpid,
    gameid,
    lang,
    currency: currency || 'USD',
    device,
    portfolio,
    fallbackHost: gameProviderUrl
  }));

  if (!url) {
    const err = new Error('568Win game launch URL could not be built. Set WIN568_GAME_PROVIDER_URL.');
    err.statusCode = 502;
    throw err;
  }

  return {
    url,
    message: 'OK',
    provider: 'win568',
    mode: 'seamless',
    gpid,
    gameid,
    portfolio,
    win568Username,
    operatorRequest: {
      Username: win568Username,
      Portfolio: portfolio,
      GpId: gpid,
      GameId: gameid,
      Lang: lang || 'en',
      Device: device,
      OddStyle: 'MY',
      IsWapSports: false,
      ServerId: resolveWin568Config().serverId
    },
    operatorResponse: {
      url: loginUrl,
      error: loginPayload && (loginPayload.error || loginPayload.Error)
        ? (loginPayload.error || loginPayload.Error)
        : null
    }
  };
}

module.exports = { launchGame, ensureRegistered };
