'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');

const CATEGORIES = [
  'login',
  'signup',
  'google_sso',
  'facebook_sso',
  'deposit',
  'region_block',
  'withdrawal',
  'game',
  'phone',
  'wallet',
  'kyc',
  'bonus',
  'network',
  'provider_mailgun',
  'provider_onegamehub',
  'provider_scorpio',
  'provider_gitslotpark',
  'provider_xxpay',
  'provider_dollarpay',
  'provider_didit',
  'other'
];

const CATEGORY_SET = new Set(CATEGORIES);
const SECRET_KEY = /password|token|otp|secret|authorization|cvv|card|ssn|cookie|pin|sign|apikey|api_key|private/i;
const recent = new Map();
const DEDUPE_MS = 45 * 1000;
/** Official provider replies (whitelist, etc.) — keep visible but don't flood every cron tick. */
const PROVIDER_DEDUPE_MS = 30 * 60 * 1000;
/** Raw third-party body kept for the admin "Provider response" row. */
const PROVIDER_RESPONSE_MAX = 12000;

function clip(value, max) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function sanitize(value, depth = 0) {
  if (value == null || depth > 4) return null;
  if (typeof value === 'string') return value.slice(0, 400);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value !== 'object') return clip(value, 200);
  const out = {};
  Object.keys(value).slice(0, 30).forEach((key) => {
    if (SECRET_KEY.test(key)) return;
    if (key === 'providerResponse' && typeof value[key] === 'string') {
      out[key] = value[key].slice(0, PROVIDER_RESPONSE_MAX);
      return;
    }
    out[key] = sanitize(value[key], depth + 1);
  });
  return out;
}

function redactProviderValue(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (typeof value === 'string') return value.slice(0, PROVIDER_RESPONSE_MAX);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactProviderValue(item, depth + 1));
  const out = {};
  Object.keys(value).slice(0, 80).forEach((key) => {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactProviderValue(value[key], depth + 1);
  });
  return out;
}

function providerResponseText(response) {
  if (response == null || response === '') return null;
  if (typeof response === 'string') {
    const text = response.trim();
    return text ? text.slice(0, PROVIDER_RESPONSE_MAX) : null;
  }
  try {
    const text = JSON.stringify(redactProviderValue(response));
    return text && text !== 'null' && text !== '{}' ? text.slice(0, PROVIDER_RESPONSE_MAX) : null;
  } catch {
    return clip(response, PROVIDER_RESPONSE_MAX);
  }
}

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_SET.has(key) ? key : 'other';
}

function shouldSkipDuplicate(row) {
  const providerResponse = row.details && typeof row.details === 'object'
    ? String(row.details.providerResponse || '').slice(0, 180)
    : '';
  const key = [
    row.ipAddress || '',
    row.category,
    row.errorCode || '',
    row.apiPath || '',
    row.message,
    providerResponse
  ].join('|');
  const now = Date.now();
  const windowMs = String(row.category || '').startsWith('provider_') ? PROVIDER_DEDUPE_MS : DEDUPE_MS;
  const prev = recent.get(key);
  if (prev && now - prev < windowMs) return true;
  recent.set(key, now);
  if (recent.size > 500) {
    for (const [k, at] of recent) {
      if (now - at > PROVIDER_DEDUPE_MS) recent.delete(k);
    }
  }
  return false;
}

async function markRegionBlockShown(ipAddress) {
  const ip = clip(ipAddress, 64);
  if (!ip) return null;
  const row = await db.UserErrorLog.findOne({
    where: {
      category: 'region_block',
      ipAddress: ip,
      createdAt: { [Op.gte]: new Date(Date.now() - 3 * 60 * 1000) }
    },
    order: [['createdAt', 'DESC']]
  });
  if (!row) return null;
  const details = {
    ...(row.details && typeof row.details === 'object' ? row.details : {}),
    userVisible: true,
    source: 'player-screen'
  };
  await row.update({ details });
  return row;
}

async function recordUserError(input = {}) {
  const message = clip(input.message, 2000);
  if (!message) return null;
  const apiPath = clip(input.apiPath, 255) || '';
  const method = String(input.httpMethod || '').toUpperCase();
  const backgroundLoad = [
    '/vip/status',
    '/auth/me',
    '/payments/withdrawal-requests',
    '/payments/chime-cashapp/withdrawals'
  ].some((skip) => apiPath.toLowerCase().includes(skip));
  if (backgroundLoad && (method === 'GET' || method === '')) return null;
  const row = {
    category: normalizeCategory(input.category),
    message,
    httpStatus: Number.isFinite(Number(input.httpStatus)) ? Number(input.httpStatus) : null,
    errorCode: clip(input.errorCode, 64),
    storeCode: clip(input.storeCode, 64),
    userId: Number.isFinite(Number(input.userId)) ? Number(input.userId) : null,
    email: clip(input.email, 255),
    username: clip(input.username, 255),
    pageUrl: clip(input.pageUrl, 512),
    apiPath: clip(input.apiPath, 255),
    httpMethod: clip(input.httpMethod, 8),
    ipAddress: clip(input.ipAddress, 64),
    userAgent: clip(input.userAgent, 512),
    countryCode: clip(input.countryCode, 8),
    countryName: clip(input.countryName, 64),
    isVpn: input.isVpn === true ? true : input.isVpn === false ? false : null,
    details: input.details && typeof input.details === 'object' ? sanitize(input.details) : null,
    createdAt: new Date()
  };
  if (shouldSkipDuplicate(row)) return null;
  try {
    return await db.UserErrorLog.create(row);
  } catch (err) {
    console.warn('[user-error-log] save failed', err?.message || err);
    return null;
  }
}

function categoryFromApiPath(apiPath) {
  const path = String(apiPath || '').toLowerCase();
  if (path.includes('/auth/google')) return 'google_sso';
  if (path.includes('/auth/facebook')) return 'facebook_sso';
  if (path.includes('/auth/register') || path.includes('/auth/signup')) return 'signup';
  if (path.includes('/auth/login')) return 'login';
  if (path.includes('/geo/')) return 'region_block';
  if (path.includes('deposit') || path.includes('/payments/')) return 'deposit';
  if (path.includes('withdraw') || path.includes('redeem')) return 'withdrawal';
  if (
    path.includes('/games') ||
    path.includes('gitslotpark') ||
    path.includes('onegamehub') ||
    path.includes('scorpio') ||
    path.includes('win568') ||
    path.includes('/bona')
  ) return 'game';
  if (path.includes('/phone')) return 'phone';
  if (path.includes('/wallet')) return 'wallet';
  if (path.includes('/kyc')) return 'kyc';
  if (path.includes('bonus') || path.includes('spin')) return 'bonus';
  return 'other';
}

async function listUserErrors(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const where = {};
  const category = clip(query.category, 32);
  if (category && category !== 'all' && CATEGORY_SET.has(category)) where.category = category;
  const storeCode = clip(query.storeCode, 64);
  if (storeCode) where.storeCode = storeCode;
  const dateFrom = clip(query.dateFrom, 10);
  const dateTo = clip(query.dateTo, 10);
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt[Op.gte] = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59.999`);
  }
  // Status-sync and deposit polling call provider query APIs. Players never see those failures.
  where.apiPath = {
    [Op.or]: [
      { [Op.is]: null },
      { [Op.notIn]: ['/api/pay/query', '/api/transfer/query', '/api/payment/query'] }
    ]
  };
  const search = clip(query.search, 120);
  if (search) {
    where[Op.or] = [
      { message: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { username: { [Op.iLike]: `%${search}%` } },
      { ipAddress: { [Op.iLike]: `%${search}%` } },
      { countryCode: { [Op.iLike]: `%${search}%` } },
      { apiPath: { [Op.iLike]: `%${search}%` } }
    ];
  }
  const { rows, count } = await db.UserErrorLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit
  });
  return {
    list: rows.map((row) => row.get({ plain: true })),
    total: count,
    page,
    limit,
    categories: CATEGORIES
  };
}

/**
 * Save an outbound provider failure, including the raw reply, for /user-errors.
 * Identical replies are collapsed for 30 minutes.
 */
function recordProviderError(input = {}) {
  const provider = String(input.provider || '').trim().toLowerCase();
  const categoryKey = `provider_${provider}`;
  const responseText = providerResponseText(input.response ?? input.rawResponse ?? input.responseBody);
  const paymentMethod = clip(input.paymentMethod, 32);
  const providerChannel = clip(input.providerChannel, 32);
  const details = {
    ...(input.details && typeof input.details === 'object' ? input.details : {}),
    provider: provider || null,
    source: 'provider-api'
  };
  if (paymentMethod) details.paymentMethod = paymentMethod.toLowerCase();
  if (providerChannel && providerChannel.toLowerCase() !== details.paymentMethod) {
    details.providerChannel = providerChannel.toLowerCase();
  }
  if (responseText) details.providerResponse = responseText;
  return recordUserError({
    category: CATEGORY_SET.has(categoryKey) ? categoryKey : 'other',
    message: input.message,
    httpStatus: input.httpStatus,
    errorCode: input.errorCode,
    storeCode: input.storeCode,
    userId: input.userId,
    email: input.email,
    username: input.username,
    pageUrl: input.pageUrl,
    apiPath: input.apiPath,
    httpMethod: input.httpMethod,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    countryCode: input.countryCode,
    countryName: input.countryName,
    details
  });
}

/**
 * Player-facing deposit failures hide the provider text.
 * The real reply is stored only for PlayJuwa player error logs.
 */
function recordPlayjuwaDepositProviderError(req, err) {
  const storeCode = String(req?.user?.storeCode || '').trim().toLowerCase();
  if (storeCode !== 'playjuwa') return null;
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const message = String(err?.rawMessage || err?.message || 'Payment provider error').trim();
  return recordUserError({
    category: 'deposit',
    message,
    httpStatus: Number(err?.statusCode) || null,
    errorCode: 'PAYMENT_PROVIDER_ERROR',
    storeCode: 'playjuwa',
    userId: req?.user?.userId,
    email: req?.user?.email,
    username: req?.user?.username,
    apiPath: req?.originalUrl || req?.path,
    httpMethod: req?.method,
    ipAddress: forwarded || req?.ip,
    userAgent: req?.headers?.['user-agent'],
    details: {
      source: 'payment-provider',
      providerResponse: err?.raw || err?.response || err?.rawMessage || null
    }
  });
}

module.exports = {
  CATEGORIES,
  recordUserError,
  markRegionBlockShown,
  recordProviderError,
  recordPlayjuwaDepositProviderError,
  listUserErrors,
  categoryFromApiPath,
  normalizeCategory
};
