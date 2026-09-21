'use strict';

const config = require('../../configs/app.config');
const { isStoreAdmin, isMasterAdmin, isDistributorAdmin } = require('../../constants/roles');

function normalizeHost(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.split(':')[0] || null;
}

/** Same rules as store create/update — keep map values aligned with DB storeCode. */
function normalizeStoreCode(raw) {
  if (raw == null || raw === '') return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 64);
}

function hostnameFromUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    return normalizeHost(raw);
  }
}

/**
 * Parse ADMIN_HOST_STORE_MAP.
 * Formats:
 *   admin.lucky.com:luckycode,admin.dragonfury.com:dragonfury
 *   {"admin.lucky.com":"luckycode"}
 */
function parseHostStoreMap(raw) {
  const map = Object.create(null);
  if (!raw || typeof raw !== 'string') return map;
  const trimmed = raw.trim();
  if (!trimmed) return map;

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      for (const [host, code] of Object.entries(obj || {})) {
        const h = normalizeHost(host);
        const c = normalizeStoreCode(code);
        if (h && c) map[h] = c;
      }
      return map;
    } catch {
      // fall through to csv parser
    }
  }

  for (const part of trimmed.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const idx = piece.lastIndexOf(':');
    if (idx <= 0) continue;
    const h = normalizeHost(piece.slice(0, idx));
    const c = normalizeStoreCode(piece.slice(idx + 1));
    if (h && c) map[h] = c;
  }
  return map;
}

function parseHostList(raw) {
  const set = new Set();
  if (!raw || typeof raw !== 'string') return set;
  for (const part of raw.split(',')) {
    const h = normalizeHost(part);
    if (h) set.add(h);
  }
  return set;
}

function getHostStoreMap() {
  return parseHostStoreMap(config.get('admin.hostStoreMap') || process.env.ADMIN_HOST_STORE_MAP || '');
}

/**
 * Optional hosts that are NOT a store panel (master/distributor only).
 * If a host is also in ADMIN_HOST_STORE_MAP, the store map wins.
 */
function getPlatformHosts() {
  const set = parseHostList(config.get('admin.platformHosts') || process.env.ADMIN_PLATFORM_HOSTS || '');
  const fromUrl = hostnameFromUrl(config.get('email.adminPanelUrl') || process.env.ADMIN_PANEL_URL || '');
  if (fromUrl) set.add(fromUrl);
  return set;
}

function isAdminHostBindingEnforced() {
  return String(process.env.ENFORCE_ADMIN_HOST_BINDING || '').toLowerCase() === 'true';
}

/**
 * Prefer explicit panel host from the admin UI, then Origin/Referer, then proxy Host.
 */
function extractAdminRequestHost(req, body = null) {
  const explicit =
    req?.headers?.['x-admin-panel-host'] ||
    (body && body.adminPanelHost) ||
    (body && body.adminHost) ||
    req?.body?.adminPanelHost ||
    req?.body?.adminHost;
  if (explicit != null && String(explicit).trim()) {
    const h = normalizeHost(String(explicit).trim());
    if (h) return h;
  }

  const fromOrigin = hostnameFromUrl(req?.headers?.origin);
  if (fromOrigin) return fromOrigin;

  const fromReferer = hostnameFromUrl(req?.headers?.referer);
  if (fromReferer) return fromReferer;

  const xfHost = req?.headers?.['x-forwarded-host'];
  if (xfHost && typeof xfHost === 'string') {
    const first = xfHost.split(',')[0].trim();
    const h = normalizeHost(first.includes(':') && !first.includes(']') ? first.split(':')[0] : first);
    if (h) return h;
  }

  const hostHeader = req?.headers?.host;
  if (hostHeader && typeof hostHeader === 'string') {
    return normalizeHost(hostHeader.split(':')[0]);
  }
  return null;
}

function baseUrlForHost(req, host) {
  if (!host) return null;
  const proto =
    (req?.headers?.['x-forwarded-proto'] && String(req.headers['x-forwarded-proto']).split(',')[0].trim()) ||
    (req?.secure ? 'https' : 'http');
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const scheme = isLocal ? proto || 'http' : 'https';
  return `${scheme}://${host}`;
}

/**
 * One rule:
 * - Host in ADMIN_HOST_STORE_MAP → that store's admin panel (store admin/staff + master/distributor)
 * - Host only in ADMIN_PLATFORM_HOSTS → master/distributor only
 * - Unknown + enforce → reject
 */
function resolveAdminLoginScope(req, bodyStoreCode, body = null) {
  const host = extractAdminRequestHost(req, body || req?.body || null);
  const map = getHostStoreMap();
  const platformHosts = getPlatformHosts();
  const enforce = isAdminHostBindingEnforced();

  // Store map always wins (admin.dragonfury.com:dragonfury works like any other store)
  if (host && map[host]) {
    return {
      kind: 'store',
      storeCode: map[host],
      host,
      adminPanelBaseUrl: baseUrlForHost(req, host),
      enforced: true
    };
  }

  if (host && platformHosts.has(host)) {
    return {
      kind: 'platform',
      storeCode: null,
      host,
      adminPanelBaseUrl: baseUrlForHost(req, host),
      enforced: true
    };
  }

  const fromBody = bodyStoreCode != null && String(bodyStoreCode).trim() ? String(bodyStoreCode).trim() : '';
  const fromEnv = config.get('admin.defaultStoreCode');
  const fallback =
    fromBody || (fromEnv && String(fromEnv).trim() ? String(fromEnv).trim() : '') || null;

  if (enforce) {
    const err = new Error('This admin website is not set up yet. Please contact support.');
    err.statusCode = 403;
    err.code = 'ADMIN_HOST_UNKNOWN';
    throw err;
  }

  return {
    kind: 'open',
    storeCode: fallback || null,
    host,
    adminPanelBaseUrl: host ? baseUrlForHost(req, host) : null,
    enforced: false
  };
}

function assertAdminMatchesLoginScope(user, scope) {
  if (!scope || scope.kind === 'open' || !scope.enforced) return;

  if (scope.kind === 'platform') {
    if (isMasterAdmin(user.role) || isDistributorAdmin(user.role) || user.isAdmin) return;
    if (isStoreAdmin(user.role)) {
      const err = new Error(
        'Wrong login page. Please open your store admin website and sign in there.'
      );
      err.statusCode = 403;
      err.code = 'ADMIN_HOST_STORE_ONLY';
      throw err;
    }
    const err = new Error('You cannot sign in on this page. Please contact support.');
    err.statusCode = 403;
    err.code = 'ADMIN_HOST_PLATFORM_ONLY';
    throw err;
  }

  if (scope.kind === 'store') {
    // Platform operators can use any store admin domain
    if (isMasterAdmin(user.role) || isDistributorAdmin(user.role)) return;

    if (!isStoreAdmin(user.role)) {
      const err = new Error('Wrong login page. Please use your admin website.');
      err.statusCode = 403;
      err.code = 'ADMIN_HOST_PLATFORM_ONLY';
      throw err;
    }

    const userStore = normalizeStoreCode(user.storeCode);
    const expected = normalizeStoreCode(scope.storeCode);
    if (!userStore || userStore !== expected) {
      const err = new Error('Wrong store admin website. Please use your own store admin link.');
      err.statusCode = 403;
      err.code = 'ADMIN_HOST_WRONG_STORE';
      throw err;
    }
  }
}

module.exports = {
  normalizeHost,
  normalizeStoreCode,
  parseHostStoreMap,
  extractAdminRequestHost,
  resolveAdminLoginScope,
  assertAdminMatchesLoginScope,
  isAdminHostBindingEnforced
};
