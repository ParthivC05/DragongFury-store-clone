'use strict';

const { gameList } = require('./bona.client');
const { isBonaConfigured, resolveBonaConfig } = require('./bona.config');

const CACHE_TTL_MS = 15 * 60 * 1000;
const cacheByCurrency = new Map();
const inflightByCurrency = new Map();

function extractGamesArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.games)) return payload.data.games;
  if (Array.isArray(payload?.games)) return payload.games;
  if (Array.isArray(payload?.list)) return payload.list;
  return [];
}

function supportsCurrency(game, currency) {
  const cur = String(currency || 'SC').toUpperCase();
  const raw =
    game?.currency ??
    game?.supportCurrency ??
    game?.supportCurrencies ??
    game?.currencies ??
    game?.walletCurrency;
  if (raw == null || raw === '') return true;
  if (Array.isArray(raw)) {
    return raw.some((c) => String(c).toUpperCase().includes(cur));
  }
  return String(raw).toUpperCase().includes(cur);
}

async function loadGamesList(options, currency) {
  if (inflightByCurrency.has(currency)) return inflightByCurrency.get(currency);

  const promise = (async () => {
    const payload = await gameList({ ...options, currency });
    const data = {
      games: extractGamesArray(payload).filter((g) => supportsCurrency(g, currency)),
      currency,
      message: payload.msg || 'OK'
    };
    cacheByCurrency.set(currency, { at: Date.now(), data });
    return data;
  })().finally(() => {
    inflightByCurrency.delete(currency);
  });

  inflightByCurrency.set(currency, promise);
  return promise;
}

/**
 * Fetch Bona game catalog for the configured currency (SC by default).
 * @returns {Promise<{ games: object[], message: string, currency: string }>}
 */
async function getGamesList(options = {}) {
  if (!isBonaConfigured()) {
    const err = new Error('Bona Games is not configured');
    err.statusCode = 503;
    throw err;
  }

  const { currency: configuredCurrency } = resolveBonaConfig();
  const currency = String(options.currency || configuredCurrency || 'SC')
    .trim()
    .toUpperCase() || 'SC';

  const cached = cacheByCurrency.get(currency);
  if (cached?.data) {
    if (Date.now() - cached.at >= CACHE_TTL_MS) {
      loadGamesList(options, currency).catch(() => {});
    }
    return cached.data;
  }

  try {
    return await loadGamesList(options, currency);
  } catch (err) {
    if (cached?.data) return cached.data;
    throw err;
  }
}

module.exports = { getGamesList };
