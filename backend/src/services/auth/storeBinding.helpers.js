const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const config = require('../../configs/app.config');

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractRequestOriginHost(req) {
  const raw = req?.headers?.origin || req?.headers?.referer;
  if (!raw || typeof raw !== 'string') return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function resolveStoreFromCode(codeNormalized) {
  if (!codeNormalized) return null;
  const storeAdmin = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      storeCode: codeNormalized,
      isActive: true,
      deletedAt: null
    },
    attributes: ['distributorCode', 'storeCode', 'userSiteUrl']
  });
  if (!storeAdmin) return null;
  return {
    storeCode: storeAdmin.storeCode || codeNormalized,
    distributorCode: storeAdmin.distributorCode || null,
    userSiteUrl: storeAdmin.userSiteUrl || null
  };
}

/**
 * When ENFORCE_STORE_ORIGIN_BINDING=true (recommended in production), signup/OAuth must come
 * from the store's configured userSiteUrl host (or localhost in non-production).
 */
async function assertClientStoreMatchesRequestOrigin(clientStoreCodeRaw, req) {
  if (process.env.ENFORCE_STORE_ORIGIN_BINDING !== 'true') return;

  const client = normalizeStoreCode(clientStoreCodeRaw);
  if (!client) return;

  const originHost = extractRequestOriginHost(req);
  if (!originHost) {
    const err = new Error('Store verification failed. Sign up from your store website.');
    err.statusCode = 403;
    err.code = 'STORE_ORIGIN_REQUIRED';
    throw err;
  }

  const resolved = await resolveStoreFromCode(client);
  if (!resolved) {
    const err = new Error('This sign-in page is not available. Please contact support.');
    err.statusCode = 400;
    err.code = 'INVALID_STORE';
    throw err;
  }

  const isProd = config.get('env') === 'production';
  const isLocalOrigin =
    originHost === 'localhost' ||
    originHost === '127.0.0.1' ||
    originHost.endsWith('.localhost');

  if (!isProd && isLocalOrigin) return;

  let allowedHost = null;
  if (resolved.userSiteUrl) {
    try {
      allowedHost = new URL(resolved.userSiteUrl).hostname.toLowerCase();
    } catch {
      allowedHost = null;
    }
  }

  if (!allowedHost || originHost !== allowedHost) {
    const err = new Error('This signup is not allowed from this website. Use the correct store URL.');
    err.statusCode = 403;
    err.code = 'STORE_ORIGIN_MISMATCH';
    throw err;
  }
}

/**
 * When client sends clientStoreCode (white-label app), enforce that the user belongs to that store.
 * If the user has no store yet, bind them to the client store (SSO / edge cases).
 */
async function ensureUserStoreMatchesOrBind(user, clientStoreCodeRaw) {
  const client = normalizeStoreCode(clientStoreCodeRaw);
  if (!client) return user;

  const userStore = normalizeStoreCode(user.storeCode || '');
  if (userStore === client) return user;

  if (userStore) {
    const err = new Error(
      'This account belongs to a different store. Use that store’s website to sign in.'
    );
    err.statusCode = 403;
    err.code = 'WRONG_STORE';
    throw err;
  }

  const resolved = await resolveStoreFromCode(client);
  if (!resolved) {
    const err = new Error('This sign-in page is not available. Please contact support.');
    err.statusCode = 400;
    err.code = 'INVALID_STORE';
    throw err;
  }

  await user.update({
    storeCode: resolved.storeCode,
    distributorCode: resolved.distributorCode != null ? resolved.distributorCode : user.distributorCode
  });
  return user.reload();
}

module.exports = {
  normalizeStoreCode,
  resolveStoreFromCode,
  assertClientStoreMatchesRequestOrigin,
  ensureUserStoreMatchesOrBind
};
