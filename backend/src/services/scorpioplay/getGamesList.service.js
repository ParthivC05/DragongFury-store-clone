'use strict';

const client = require('./scorpio.client');
const { isScorpioConfigured } = require('./scorpio.config');

const CACHE_TTL_MS = 15 * 60 * 1000;
const PROVIDER_CONCURRENCY = 4;
let cache = null;
let inflight = null;

const GAME_TYPE_LABELS = {
  0: 'Slots',
  1: 'Live Casino',
  2: 'Other'
};

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function pickHttpUrl(value, depth = 0) {
  if (value == null || depth > 5) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    return isHttpUrl(text) ? text : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickHttpUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  const preferredKeys = [
    'url',
    'src',
    'href',
    'image',
    'icon',
    'gameImage',
    'path',
    'link',
    'en',
    'default',
    '216x160',
    '500x500',
    '250x180'
  ];
  for (const key of preferredKeys) {
    if (value[key] == null) continue;
    const found = pickHttpUrl(value[key], depth + 1);
    if (found) return found;
  }
  for (const nested of Object.values(value)) {
    const found = pickHttpUrl(nested, depth + 1);
    if (found) return found;
  }
  return '';
}

function pickGameIcon(raw) {
  return (
    pickHttpUrl(raw?.gameImage) ||
    pickHttpUrl(raw?.image) ||
    pickHttpUrl(raw?.icon) ||
    pickHttpUrl(raw?.logo) ||
    pickHttpUrl(raw?.thumbnail) ||
    pickHttpUrl(raw?.thumbnails) ||
    pickHttpUrl(raw?.gameIcon) ||
    ''
  );
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  if (value && Array.isArray(value.providers)) return value.providers;
  if (value && Array.isArray(value.games)) return value.games;
  return [];
}

function isActiveProvider(row) {
  const status = row.status ?? row.Status ?? row.enabled ?? row.isEnabled;
  if (status === false || status === 0 || status === '0') return false;
  return true;
}

function normalizeProvider(raw) {
  const providerId = Number(raw.providerId ?? raw.providerID ?? raw.id);
  return {
    providerId: Number.isFinite(providerId) ? providerId : null,
    providerName: String(raw.providerName || raw.name || '').trim(),
    logo: String(raw.logo || raw.image || '').trim(),
    status: raw.status
  };
}

function normalizeGame(raw, provider) {
  const gameCode = String(raw.gameID ?? raw.gameId ?? raw.gameCode ?? raw.code ?? '').trim();
  const inMaintenance = raw.inMaintenance === true || raw.isMaintain === true || raw.maintain === true;
  const gameType = Number(raw.gameType ?? raw.type);
  return {
    gameId: gameCode,
    gameCode,
    providerId: provider.providerId,
    providerName: provider.providerName,
    name: String(raw.gameName || raw.name || gameCode).trim() || 'Game',
    icon: pickGameIcon(raw),
    gameType: Number.isFinite(gameType) ? gameType : 0,
    gameTypeLabel: GAME_TYPE_LABELS[gameType] || GAME_TYPE_LABELS[0],
    inMaintenance
  };
}

async function mapPool(items, limit, mapper) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) || 0 }, () => worker());
  await Promise.all(workers);
  return results;
}

async function loadGames() {
  if (inflight) return inflight;
  inflight = (async () => {
    const providersPayload = await client.listProviders();
    const providers = asArray(providersPayload)
      .map(normalizeProvider)
      .filter((row) => row.providerId != null && isActiveProvider(row));

    if (!client.isSuccess(providersPayload) && !providers.length) {
      const err = new Error(client.errorMessage(providersPayload) || 'Failed to fetch Scorpio Play providers');
      err.statusCode = 502;
      err.response = providersPayload;
      throw err;
    }

    const perProvider = await mapPool(providers, PROVIDER_CONCURRENCY, async (provider) => {
      try {
        const gamesPayload = await client.listGames(provider.providerId);
        const listed = asArray(gamesPayload);
        if (!client.isSuccess(gamesPayload) && !listed.length) return [];
        return listed
          .map((row) => normalizeGame(row, provider))
          .filter((game) => game.gameCode && !game.inMaintenance);
      } catch (err) {
        client.log.warn('Scorpio Play game list failed', {
          providerId: provider.providerId,
          message: err.message
        });
        return [];
      }
    });

    const games = perProvider.flat();
    const data = { games, providers, message: 'OK' };
    cache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function getGamesList() {
  if (!isScorpioConfigured()) {
    const err = new Error('Scorpio Play API is not configured');
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

module.exports = { getGamesList, GAME_TYPE_LABELS };
