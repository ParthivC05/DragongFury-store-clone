'use strict';

const crypto = require('crypto');
const { request } = require('./client');
const { isGitslotparkConfigured, resolveGitslotparkConfig } = require('./gitslotpark.config');

const CACHE_TTL_MS = 15 * 60 * 1000;
const cacheByKey = new Map();
const inflightByKey = new Map();

function cacheKey(req) {
  const { provider, authToken, baseUrl } = resolveGitslotparkConfig(req);
  const tokenHash = crypto.createHash('sha1').update(String(authToken || '')).digest('hex').slice(0, 12);
  return `${provider}|${baseUrl}|${tokenHash}`;
}

async function loadGamesList(req, key) {
  if (inflightByKey.has(key)) return inflightByKey.get(key);

  const promise = (async () => {
    const payload = await request(req, 'GET', '/gamelist');
    const code = payload && payload.code;
    const message = (payload && payload.message) || 'OK';

    if (code !== 0) {
      const err = new Error(message || 'Failed to fetch GitSlotPark games');
      err.statusCode = 502;
      err.response = payload;
      throw err;
    }

    const data = {
      games: Array.isArray(payload.data) ? payload.data : [],
      message
    };
    cacheByKey.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => {
    inflightByKey.delete(key);
  });

  inflightByKey.set(key, promise);
  return promise;
}

/**
 * Fetch the full game catalog from GitSlotPark.
 * @param {import('express').Request} req
 * @returns {Promise<{ games: object[], message: string }>}
 */
async function getGamesList(req) {
  if (!isGitslotparkConfigured(req)) {
    const err = new Error('GitSlotPark is not configured');
    err.statusCode = 503;
    throw err;
  }

  const key = cacheKey(req);
  const cached = cacheByKey.get(key);
  if (cached?.data) {
    if (Date.now() - cached.at >= CACHE_TTL_MS) {
      loadGamesList(req, key).catch(() => {});
    }
    return cached.data;
  }

  try {
    return await loadGamesList(req, key);
  } catch (err) {
    if (cached?.data) return cached.data;
    throw err;
  }
}

module.exports = { getGamesList };
