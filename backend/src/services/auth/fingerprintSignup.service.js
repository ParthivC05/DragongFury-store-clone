'use strict';

const { Op } = require('sequelize');
const config = require('../../configs/app.config');
const db = require('../../db/models');
const { logger } = require('../../libs/logger');
const { normalizeStoreCode } = require('../bonusCodes/resolveSignupBonusCodeForRegister.service');
const { isAnyFingerprintSignupIpAllowlisted } = require('./fingerprintSignupIpAllowlist.service');

const LOG_PREFIX = '[fingerprint-signup]';

const REGION_API_HOST = {
  us: 'https://api.fpjs.io',
  eu: 'https://api.eu.fpjs.io',
  ap: 'https://api.ap.fpjs.io'
};

const DEVICE_ALREADY_REGISTERED_MESSAGE =
  'An account has already been created on this device. Only one account is allowed per device.';

const DEFAULT_ENFORCED_STORES = [];

function truncate(value, max = 12) {
  if (!value || typeof value !== 'string') return value ?? null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function fingerprintSecretKey() {
  return (
    String(config.get('fingerprint.secretKey') || process.env.FINGERPRINT_SECRET_API_KEY || process.env.FINGERPRINT_SECRET_KEY || '')
      .trim()
  );
}

function fingerprintRegion() {
  return String(config.get('fingerprint.region') || process.env.FINGERPRINT_REGION || 'us')
    .trim()
    .toLowerCase() || 'us';
}

function enforcedStoreCodeSet() {
  const raw = String(config.get('fingerprint.enforcedStoreCodes') || '').trim();
  const parts = (raw || DEFAULT_ENFORCED_STORES.join(','))
    .split(',')
    .map((id) => normalizeStoreCode(id))
    .filter(Boolean);
  return new Set(parts);
}

function isFingerprintSignupEnforced() {
  return Boolean(fingerprintSecretKey());
}

function isFingerprintEnforcedStore(storeCode) {
  if (!isFingerprintSignupEnforced()) return false;
  const store = normalizeStoreCode(storeCode);
  if (!store) return false;
  return enforcedStoreCodeSet().has(store);
}

function collectSignupClientIps(req) {
  const { getClientIp, getPublicIpCandidates } = require('../../rest-resources/middlewares/geoBlock.middleware');
  const ips = [];
  const seen = new Set();
  const add = (value) => {
    const n = String(value || '').trim().toLowerCase();
    if (!n || seen.has(n)) return;
    seen.add(n);
    ips.push(n);
  };
  try {
    for (const ip of getPublicIpCandidates(req) || []) add(ip);
  } catch (_) {
    /* ignore */
  }
  add(getClientIp(req));
  return ips;
}

function extractFingerprintApiMessage(payload, fallback) {
  const candidates = [
    payload?.error?.message,
    payload?.error?.code,
    typeof payload?.error === 'string' ? payload.error : null,
    payload?.message,
    payload?.products?.identification?.error?.message,
    payload?.products?.identification?.error?.code,
    typeof payload?.products?.identification?.error === 'string'
      ? payload.products.identification.error
      : null
  ];

  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed !== '[object Object]') return trimmed;
    }
  }

  return fallback;
}

async function readFingerprintErrorMessage(response, fallback) {
  try {
    const text = await response.text();
    if (!text?.trim()) {
      return fallback || `Fingerprint API error (${response.status} ${response.statusText || ''})`.trim();
    }
    try {
      const json = JSON.parse(text);
      return extractFingerprintApiMessage(json, fallback || text.slice(0, 300));
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return fallback || `Fingerprint API error (${response.status})`;
  }
}

async function verifyFingerprintRequest(requestId) {
  const secretKey = fingerprintSecretKey();
  const region = fingerprintRegion();
  const baseUrl = REGION_API_HOST[region] || REGION_API_HOST.us;
  const url = `${baseUrl}/events/${encodeURIComponent(requestId)}`;

  logger.info(`${LOG_PREFIX} verifying request`, {
    requestId: truncate(requestId, 24),
    region,
    baseUrl
  });

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Auth-API-Key': secretKey,
        Accept: 'application/json'
      }
    });
  } catch (err) {
    const message = err?.message || String(err);
    logger.error(`${LOG_PREFIX} Fingerprint API request failed (network)`, { error: message });
    const error = new Error(message);
    error.statusCode = 400;
    error.code = 'FINGERPRINT_VERIFY_FAILED';
    throw error;
  }

  if (!response.ok) {
    const apiMessage = await readFingerprintErrorMessage(
      response,
      `Fingerprint API error (${response.status} ${response.statusText || ''})`.trim()
    );
    logger.error(`${LOG_PREFIX} Fingerprint API returned non-OK`, {
      status: response.status,
      apiMessage
    });
    const error = new Error(apiMessage);
    error.statusCode = 400;
    error.code = 'FINGERPRINT_VERIFY_FAILED';
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    const message = err?.message || 'Fingerprint API response was not valid JSON';
    const error = new Error(message);
    error.statusCode = 400;
    error.code = 'FINGERPRINT_VERIFY_FAILED';
    throw error;
  }

  const identification = payload?.products?.identification;
  const visitorId = identification?.data?.visitorId;
  if (!visitorId) {
    const apiMessage = extractFingerprintApiMessage(
      payload,
      'Fingerprint API response did not include a visitorId'
    );
    const error = new Error(apiMessage);
    error.statusCode = 400;
    error.code = 'FINGERPRINT_VERIFY_FAILED';
    throw error;
  }

  return { visitorId, ip: extractFingerprintEventIp(payload) };
}

function extractFingerprintEventIp(payload) {
  const data = payload?.products?.identification?.data || {};
  const ipInfo = payload?.products?.ipInfo?.data || {};
  const candidates = [data.ip, data.ipAddress, ipInfo.v4?.address, ipInfo.v6?.address, ipInfo.address];
  for (const value of candidates) {
    const ip = String(value || '').trim();
    if (ip) return ip;
  }
  return null;
}

function mergeClientIps(clientIps, extraIp) {
  const ips = [];
  const seen = new Set();
  const add = (value) => {
    const n = String(value || '').trim().toLowerCase();
    if (!n || seen.has(n)) return;
    seen.add(n);
    ips.push(n);
  };
  if (Array.isArray(clientIps)) {
    for (const ip of clientIps) add(ip);
  }
  add(extraIp);
  return ips;
}

function deviceAlreadyRegisteredError(registeredEmail) {
  const err = new Error(DEVICE_ALREADY_REGISTERED_MESSAGE);
  err.statusCode = 400;
  err.code = 'DEVICE_ALREADY_REGISTERED';
  if (registeredEmail) {
    err.data = { registeredEmail };
  }
  return err;
}

async function assertDeviceAvailableForSignup(visitorId, storeCode, { skipOccupancy = false } = {}) {
  if (!visitorId || skipOccupancy) return;

  const store = normalizeStoreCode(storeCode);
  const where = store
    ? { deviceVisitorId: visitorId, storeCode: store }
    : { deviceVisitorId: visitorId, storeCode: { [Op.is]: null } };

  const existing = await db.User.findOne({
    where,
    attributes: ['userId', 'email'],
    order: [['userId', 'DESC']]
  });

  if (existing) {
    logger.warn(`${LOG_PREFIX} device already registered`, {
      visitorId: truncate(visitorId, 16),
      storeCode: store || null,
      existingUserId: existing.userId
    });
    throw deviceAlreadyRegisteredError(existing.email || null);
  }
}

/**
 * Enforce one account per device for opted-in stores only.
 * Other stores skip this entirely so their signup/SSO is unchanged.
 *
 * Allowlisted IPs skip the occupancy block (and may omit fingerprintRequestId).
 *
 * @returns {Promise<string|null>} visitorId to persist, or null
 */
async function enforceSignupDevicePolicy({
  fingerprintRequestId,
  storeCode,
  clientIps
} = {}) {
  const store = normalizeStoreCode(storeCode);
  if (!isFingerprintEnforcedStore(store)) {
    return null;
  }

  let ips = mergeClientIps(clientIps);
  let ipAllowlisted = await isAnyFingerprintSignupIpAllowlisted(ips, store);
  const requestId = fingerprintRequestId != null ? String(fingerprintRequestId).trim() : '';

  let visitorId = null;
  if (requestId) {
    try {
      const verified = await verifyFingerprintRequest(requestId);
      visitorId = verified?.visitorId || null;
      ips = mergeClientIps(ips, verified?.ip);
      if (!ipAllowlisted) {
        ipAllowlisted = await isAnyFingerprintSignupIpAllowlisted(ips, store);
      }
    } catch (err) {
      if (!ipAllowlisted) throw err;
      logger.warn(`${LOG_PREFIX} allowlisted IP fingerprint verify failed; continuing signup`, {
        message: err.message
      });
    }
  }

  if (ipAllowlisted) {
    logger.info(`${LOG_PREFIX} IP allowlisted — skipping device occupancy check`, {
      storeCode: store,
      requestIps: ips,
      hasVisitorId: Boolean(visitorId)
    });
    return visitorId || null;
  }

  logger.info(`${LOG_PREFIX} IP not on signup allowlist`, {
    storeCode: store,
    requestIps: ips
  });

  if (!visitorId) {
    const err = new Error('fingerprintRequestId is required');
    err.statusCode = 400;
    err.code = 'FINGERPRINT_REQUIRED';
    throw err;
  }

  await assertDeviceAvailableForSignup(visitorId, store);
  return visitorId;
}

module.exports = {
  DEVICE_ALREADY_REGISTERED_MESSAGE,
  isFingerprintSignupEnforced,
  isFingerprintEnforcedStore,
  collectSignupClientIps,
  enforceSignupDevicePolicy
};
