'use strict';

const crypto = require('crypto');
const { listHmacSalts, resolveOneGameHubConfig } = require('../onegamehub.config');
const { getActiveSession } = require('./session.service');
const { ERRORS } = require('../onegamehub.constants');

/**
 * HMAC-SHA256 of alphabetically sorted query params (excluding `hash`).
 * 1GameHub signs query string only — body is not part of the hash.
 */
function computeQueryHash(query, salt) {
  const params = { ...(query || {}) };
  delete params.hash;

  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHmac('sha256', salt).update(payload).digest('hex');
}

async function verifyCallbackHash(query) {
  const received = query?.hash != null ? String(query.hash) : '';
  if (!received) {
    return { ok: false, error: ERRORS.unauthorized };
  }

  const playerId = query?.player_id || query?.playerId || '';
  let storeCode = '';
  if (playerId) {
    const session = await getActiveSession(playerId);
    storeCode = session?.storeCode || '';
  }

  const preferred = resolveOneGameHubConfig(storeCode).hmacSalt;
  const salts = storeCode && preferred ? [preferred] : listHmacSalts(storeCode);
  if (!salts.length) {
    return { ok: false, error: ERRORS.unknown };
  }

  for (const salt of salts) {
    if (computeQueryHash(query, salt) === received) {
      return { ok: true };
    }
  }

  return { ok: false, error: ERRORS.unauthorized };
}

module.exports = { computeQueryHash, verifyCallbackHash };
