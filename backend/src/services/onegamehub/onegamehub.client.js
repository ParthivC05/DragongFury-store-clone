'use strict';

const axios = require('axios');
const config = require('../../configs/app.config');
const { createLogger } = require('../../libs/logger');
const { PROVIDER_ACTIONS } = require('./onegamehub.constants');
const { resolveOneGameHubConfig } = require('./onegamehub.config');

const log = createLogger('onegamehub');

function httpTimeout(fallbackMs) {
  const ms = Number(config.get('http.thirdPartyTimeoutMs'));
  return Number.isFinite(ms) && ms > 0 ? ms : fallbackMs;
}

function appendQuery(baseUrl, params) {
  const qs = Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  const separator = String(baseUrl).includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${qs}`;
}

function redactSecret(url) {
  return String(url || '').replace(/([?&]secret=)[^&]*/i, '$1***');
}

function extractGames(payload) {
  if (Array.isArray(payload?.response)) return payload.response;
  if (Array.isArray(payload?.data?.games)) return payload.data.games;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.games)) return payload.games;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload)) return payload;
  return [];
}

function extractLaunchUrl(payload, rawText) {
  return (
    payload?.response?.game_url ||
    payload?.game_url ||
    payload?.url ||
    payload?.gameUrl ||
    payload?.launchUrl ||
    (typeof rawText === 'string' && rawText.trim().startsWith('http') ? rawText.trim() : '')
  );
}

function isHubError(payload, httpStatus) {
  if (!payload || typeof payload !== 'object') return httpStatus >= 400;
  if (payload.code && String(payload.code).toUpperCase() !== 'SUCCESS') return true;
  if (Number(payload.status) >= 400) return true;
  if (payload.error) return true;
  return false;
}

function hubErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return '1GameHub request failed';
  if (typeof payload.message === 'string' && payload.message) return payload.message;
  if (typeof payload.error === 'string' && payload.error) return payload.error;
  if (typeof payload.error?.message === 'string' && payload.error.message) return payload.error.message;
  if (typeof payload.response?.message === 'string' && payload.response.message) {
    return payload.response.message;
  }
  return '1GameHub request failed';
}

async function getFromProvider(params, { timeoutMs, storeCode } = {}) {
  const { baseUrl, secretToken } = resolveOneGameHubConfig(storeCode);
  if (!baseUrl || !secretToken) {
    const err = new Error('1GameHub is not configured');
    err.statusCode = 503;
    throw err;
  }

  const url = appendQuery(baseUrl, { ...params, secret: secretToken });
  const startedAt = Date.now();

  const res = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'PartnerPlatform/1.0'
    },
    timeout: timeoutMs || httpTimeout(30000),
    validateStatus: () => true,
    responseType: 'text',
    transformResponse: [(data) => data]
  });

  const rawText = typeof res.data === 'string' ? res.data : '';
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (_) {
    payload = null;
  }

  log.info('1GameHub RPC', {
    action: params.action,
    httpStatus: res.status,
    durationMs: Date.now() - startedAt,
    url: redactSecret(url)
  });

  if (isHubError(payload, res.status)) {
    const err = new Error(hubErrorMessage(payload));
    err.statusCode = 502;
    err.payload = payload;
    throw err;
  }

  return { payload, rawText, httpStatus: res.status };
}

async function fetchAvailableGames(storeCode) {
  const { payload } = await getFromProvider(
    { action: PROVIDER_ACTIONS.AVAILABLE_GAMES },
    { timeoutMs: Math.min(httpTimeout(20000), 25000), storeCode }
  );
  return extractGames(payload);
}

async function fetchRealPlay({ gameId, playerId, currency, storeCode }) {
  const { payload, rawText } = await getFromProvider(
    {
      action: PROVIDER_ACTIONS.REAL_PLAY,
      game_id: gameId,
      player_id: playerId,
      currency
    },
    { timeoutMs: 15000, storeCode }
  );

  const gameUrl = extractLaunchUrl(payload, rawText);
  if (!gameUrl) {
    const err = new Error('1GameHub did not return a game URL');
    err.statusCode = 502;
    throw err;
  }

  return {
    url: String(gameUrl).trim(),
    token: payload?.response?.token || payload?.token || null
  };
}

module.exports = {
  fetchAvailableGames,
  fetchRealPlay,
  redactSecret
};
