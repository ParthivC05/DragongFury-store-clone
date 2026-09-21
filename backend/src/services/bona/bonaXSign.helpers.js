'use strict';

const crypto = require('crypto');
const { resolveBonaConfig } = require('./bona.config');

/**
 * Bona Seamless X-Sign:
 * MD5( rawJsonBodyString + appSecret )
 * Body string must be the exact HTTP body Bona sent.
 */
function computeXSign(rawBody, appSecret) {
  const body = typeof rawBody === 'string' ? rawBody : String(rawBody || '');
  return crypto.createHash('md5').update(body + String(appSecret || '')).digest('hex');
}

function verifyXSign(rawBody, headerSign) {
  const { appSecret } = resolveBonaConfig();
  if (!appSecret) return false;
  const expected = computeXSign(rawBody, appSecret);
  const actual = String(headerSign || '').trim().toLowerCase();
  if (!actual || expected.length !== actual.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch (_) {
    return expected === actual;
  }
}

/** Seamless response codes (Bona docs). */
const SEAMLESS_CODE = {
  SUCCESS: 0,
  USER_NOT_FOUND: 1,
  SYSTEM_ERROR: 2,
  BETTING_NOT_ALLOWED: 3,
  VERIFICATION_FAILED: 4,
  PLAYER_FROZEN: 5,
  INVALID_PARAMS: 6,
  GAME_NOT_FOUND: 7,
  BETTING_LIMIT: 8,
  DUPLICATE: 9,
  ALREADY_CANCELED: 10,
  CANNOT_CANCEL: 11,
  OTHER: 12,
  PROXY_NOT_FOUND: 13
};

function seamlessOk(balance, currency) {
  const payload = {
    code: SEAMLESS_CODE.SUCCESS,
    balance: String(balance)
  };
  if (currency) payload.currency = currency;
  return payload;
}

function seamlessError(code, balance = '0') {
  return {
    code: Number(code) || SEAMLESS_CODE.SYSTEM_ERROR,
    balance: String(balance)
  };
}

module.exports = {
  computeXSign,
  verifyXSign,
  SEAMLESS_CODE,
  seamlessOk,
  seamlessError
};
