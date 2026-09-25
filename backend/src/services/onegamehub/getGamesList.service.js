'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchAvailableGames } = require('./onegamehub.client');
const { isOneGameHubConfigured } = require('./onegamehub.config');
const { isBlockedBrand } = require('./onegamehub.constants');
const { isHiddenBrokenProviderGame } = require('../../constants/hiddenBrokenGames');

const CACHE_TTL_MS = 15 * 60 * 1000;
const cacheByStore = new Map();
const inflightByStore = new Map();

function normalizeMediaUrl(url) {
  return String(url || '').replace(/\u0445/g, 'x').replace(/\u0425/g, 'X');
}

function pickThumbnails(game) {
  const media = game?.media || {};
  const thumbs = media.thumbnails || {};
  return [
    thumbs['500x500'],
    thumbs['500x360'],
    thumbs['500x280'],
    game?.thumbnailUrl,
    game?.mobileThumbnailUrl,
    thumbs['250x180'],
    media.icon,
    game?.icon,
    game?.thumbnail,
    game?.image
  ]
    .map((url) => normalizeMediaUrl(typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url && url.startsWith('http'));
}

function mapProviderGame(game) {
  const gameId = game?.id ?? game?.game_id ?? game?.alias;
  if (gameId == null || String(gameId).trim() === '') return null;

  const iconUrls = pickThumbnails(game);
  return {
    id: String(gameId).trim(),
    gameid: String(gameId).trim(),
    name: game.name || game.alias || String(gameId),
    brand: game.brand || game.brand_id || game.provider || '',
    brandId: game.brand_id || '',
    categories: Array.isArray(game.categories) ? game.categories : [],
    subcategories: Array.isArray(game.subcategories) ? game.subcategories : [],
    paylines: game.paylines ?? null,
    image: iconUrls[0] || '',
    iconUrls: iconUrls.slice(0, 4)
  };
}

function cacheKey(storeCode) {
  return String(storeCode || 'casinoslots').trim().toLowerCase() || 'casinoslots';
}

function diskCachePath(storeCode) {
  return path.join(os.tmpdir(), `partner-ogh-games-v3-${cacheKey(storeCode)}.json`);
}

function readDiskCache(storeCode) {
  try {
    const parsed = JSON.parse(fs.readFileSync(diskCachePath(storeCode), 'utf8'));
    if (Array.isArray(parsed?.data?.games) && parsed.data.games.length) {
      return { at: Number(parsed.at) || 0, data: parsed.data };
    }
  } catch {
    /* missing / corrupt */
  }
  return null;
}

function writeDiskCache(storeCode, entry) {
  fs.promises
    .writeFile(diskCachePath(storeCode), JSON.stringify(entry))
    .catch(() => {});
}

function hydrateFromDisk(storeCode) {
  const key = cacheKey(storeCode);
  if (cacheByStore.has(key)) return cacheByStore.get(key);
  const fromDisk = readDiskCache(storeCode);
  if (fromDisk) cacheByStore.set(key, fromDisk);
  return fromDisk;
}

function normalizeCachedCatalog(data) {
  if (!data?.games?.length) return data;
  return {
    ...data,
    games: data.games.map((game) => ({
      ...game,
      image: normalizeMediaUrl(game.image),
      iconUrls: Array.isArray(game.iconUrls) ? game.iconUrls.map(normalizeMediaUrl) : game.iconUrls
    }))
  };
}

function mapCatalog(rawGames) {
  return (rawGames || [])
    .filter((game) => !isBlockedBrand(game) && !isHiddenBrokenProviderGame(game))
    .map(mapProviderGame)
    .filter(Boolean)
    .filter((game) => !isBlockedBrand(game) && !isHiddenBrokenProviderGame(game));
}

async function loadGamesList(storeCode) {
  const key = cacheKey(storeCode);
  if (inflightByStore.has(key)) return inflightByStore.get(key);

  const promise = (async () => {
    const rawGames = await fetchAvailableGames(storeCode);
    const data = {
      games: mapCatalog(rawGames),
      currency: 'SC',
      message: 'OK'
    };
    const entry = { at: Date.now(), data };
    cacheByStore.set(key, entry);
    writeDiskCache(storeCode, entry);
    return data;
  })().finally(() => {
    inflightByStore.delete(key);
  });

  inflightByStore.set(key, promise);
  return promise;
}

/**
 * Live catalog from 1GameHub `available_games`, cached in memory + disk so
 * lobby loads do not wait on the upstream catalog (up to 2 minutes).
 */
async function getGamesList(storeCode) {
  if (!isOneGameHubConfigured(storeCode)) {
    const err = new Error('1GameHub is not configured');
    err.statusCode = 503;
    throw err;
  }

  const cached = hydrateFromDisk(storeCode);
  if (cached?.data) {
    if (Date.now() - cached.at >= CACHE_TTL_MS) {
      loadGamesList(storeCode).catch(() => {});
    }
    return normalizeCachedCatalog(cached.data);
  }

  return loadGamesList(storeCode);
}

function warmOneGameHubGamesCache(storeCode = 'casinoslots') {
  if (!isOneGameHubConfigured(storeCode)) return;
  hydrateFromDisk(storeCode);
  loadGamesList(storeCode).catch(() => {});
}

module.exports = { getGamesList, mapProviderGame, warmOneGameHubGamesCache };
