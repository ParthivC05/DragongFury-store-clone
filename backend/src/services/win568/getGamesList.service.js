'use strict';

const { isWin568OperatorConfigured } = require('./win568.config');
const client = require('./win568.client');

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache = null;
let inflight = null;

/** Lobbies for products 568Win listed on this agent (not always in Get Game List). */
const PRODUCT_LOBBIES = [
  { gameId: 0, gpId: 10000, portfolio: 'SportsBook', name: 'SBO Sportsbook', provider: 'SBO Sportsbook' },
  { gameId: 0, gpId: 10000, portfolio: 'VirtualSports', name: 'SBO Virtual Sports', provider: 'SBO VirtualSports' },
  { gameId: 0, gpId: 10000, portfolio: 'Casino', name: '568Win Live Casino', provider: '568Win Live Casino' },
  { gameId: 6101, gpId: 10000, portfolio: 'Games', name: 'SBO Games', provider: 'SBO Games' },
  { gameId: 0, gpId: 14, portfolio: 'SeamlessGame', name: 'SBO Slots', provider: 'SBO Slots' },
  { gameId: 0, gpId: 1029, portfolio: 'SeamlessGame', name: '568Win Games', provider: '568Win Games' },
  { gameId: 0, gpId: 16, portfolio: 'SeamlessGame', name: 'FunkyGames', provider: 'FunkyGames' },
  { gameId: 0, gpId: 1015, portfolio: 'ThirdPartySportsBook', name: 'AFB Sportsbook', provider: 'AFB Sportsbook' },
  { gameId: 0, gpId: 1016, portfolio: 'SeamlessGame', name: 'AFB Games', provider: 'AFB Games' }
];

function extractGames(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return (
    payload.SeamlessGameProviderGames
    || payload.seamlessGameProviderGames
    || payload.games
    || []
  );
}

function englishName(gameInfos) {
  if (!Array.isArray(gameInfos) || !gameInfos.length) return '';
  const en = gameInfos.find((info) => String(info.Language || info.language || '').toLowerCase() === 'en');
  const row = en || gameInfos[0];
  return String(row.GameName || row.gameName || '').trim();
}

function englishIcon(gameInfos) {
  if (!Array.isArray(gameInfos) || !gameInfos.length) return '';
  const en = gameInfos.find((info) => String(info.Language || info.language || '').toLowerCase() === 'en');
  const row = en || gameInfos[0];
  return String(row.GameIconUrl || row.gameIconUrl || '').trim();
}

function normalizeGame(raw) {
  const gameInfos = raw.GameInfos || raw.gameInfos || [];
  const enabled = raw.IsEnabled !== false && raw.isEnabled !== false;
  const maintain = raw.IsMaintain === true || raw.isMaintain === true;
  return {
    gameId: raw.GameId ?? raw.gameId ?? raw.gameID,
    gpId: raw.GameProviderId ?? raw.gameProviderId ?? raw.GpId ?? raw.gpId,
    provider: raw.GameProvider || raw.gameProvider || raw.Provider || raw.provider || '',
    name: englishName(gameInfos) || String(raw.GameName || raw.gameName || ''),
    icon: englishIcon(gameInfos),
    gameType: String(raw.GameType ?? raw.gameType ?? ''),
    device: raw.Device || raw.device || '',
    rtp: raw.RTP ?? raw.rtp ?? null,
    portfolio: String(raw.portfolio || raw.Portfolio || 'SeamlessGame'),
    enabled,
    maintain
  };
}

async function loadGames() {
  if (inflight) return inflight;
  inflight = (async () => {
    const payload = await client.getSeamlessGameList({ gpid: 1, isGetAll: true });
    const listed = extractGames(payload);
    if (!client.isNoError(payload) && !listed.length) {
      const err = new Error(client.errorMsg(payload) || 'Failed to fetch 568Win game list');
      err.statusCode = 502;
      err.response = payload;
      throw err;
    }
    const fromApi = listed
      .map(normalizeGame)
      .filter((game) => game.enabled && !game.maintain && game.gameId != null);
    // Never let Get Game List hide our product tiles (SBO Slots, Funky, …).
    const lobbyKeys = new Set(PRODUCT_LOBBIES.map((row) => `${row.portfolio}:${row.gpId}:${row.gameId}`));
    const apiGames = fromApi.filter((game) => !lobbyKeys.has(`${game.portfolio}:${game.gpId}:${game.gameId}`));
    const games = [...PRODUCT_LOBBIES, ...apiGames];
    const data = { games, message: 'OK' };
    cache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function getGamesList() {
  if (!isWin568OperatorConfigured()) {
    const err = new Error('568Win operator API is not configured');
    err.statusCode = 503;
    throw err;
  }

  if (cache?.data) {
    if (Date.now() - cache.at >= CACHE_TTL_MS) {
      loadGames().catch(() => {});
    }
    return cache.data;
  }

  try {
    return await loadGames();
  } catch (err) {
    if (cache?.data) return cache.data;
    throw err;
  }
}

module.exports = { getGamesList };
