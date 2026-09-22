'use strict';

const config = require('../../configs/app.config');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const {
  normalizeHost,
  normalizeStoreCode,
  parseHostStoreMap
} = require('../auth/adminHostBinding.helpers');

/** Public user-site host → storeCode. Overridden/extended by PUBLIC_HOST_STORE_MAP. */
const DEFAULT_PUBLIC_HOST_STORE_MAP = {
  'dragonfury.com': 'dragonfury',
  'www.dragonfury.com': 'dragonfury',
  'dragonfury.casino': 'dragonfury',
  'www.dragonfury.casino': 'dragonfury',
  'goodgdragon.com': 'goodgdragon',
  'www.goodgdragon.com': 'goodgdragon',
  'luckywinnerspower.com': 'goodwork',
  'www.luckywinnerspower.com': 'goodwork',
  'myvepower.com': 'myvepower',
  'www.myvepower.com': 'myvepower',
  'casinoslots.casino': 'casinoslots',
  'www.casinoslots.casino': 'casinoslots',
  'sweepstakebet.com': 'sweepstakebet',
  'www.sweepstakebet.com': 'sweepstakebet',
  'grandsweep.xyz': 'grandsweeps',
  'www.grandsweep.xyz': 'grandsweeps',
  'winner4.com': 'winners4',
  'www.winner4.com': 'winners4',
  'betgamezone.com': 'betgamezone',
  'www.betgamezone.com': 'betgamezone'
};

const SITE_URL_CACHE_MS = 60_000;
let siteUrlCache = { at: 0, map: null };

function hostnameFromUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    return normalizeHost(raw);
  }
}

function getPublicHostStoreMap() {
  const map = { ...DEFAULT_PUBLIC_HOST_STORE_MAP };
  const extra = parseHostStoreMap(
    config.get('public.hostStoreMap') || process.env.PUBLIC_HOST_STORE_MAP || ''
  );
  Object.assign(map, extra);
  return map;
}

function extractPublicRequestHost(req) {
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
  return hostnameFromUrl(req?.headers?.origin) || hostnameFromUrl(req?.headers?.referer);
}

function publicOriginFromReq(req, host) {
  const resolvedHost = host || extractPublicRequestHost(req);
  if (!resolvedHost) return null;
  const protoHeader = req?.headers?.['x-forwarded-proto'];
  const proto =
    (protoHeader && String(protoHeader).split(',')[0].trim()) ||
    (req?.secure ? 'https' : 'http');
  const isLocal = resolvedHost === 'localhost' || resolvedHost === '127.0.0.1';
  const scheme = isLocal ? proto || 'http' : 'https';
  return `${scheme}://${resolvedHost}`;
}

async function hostMapFromUserSiteUrls() {
  const now = Date.now();
  if (siteUrlCache.map && now - siteUrlCache.at < SITE_URL_CACHE_MS) {
    return siteUrlCache.map;
  }
  const rows = await db.User.findAll({
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      isActive: true,
      deletedAt: null
    },
    attributes: ['storeCode', 'userSiteUrl']
  });
  const map = Object.create(null);
  for (const row of rows) {
    const code = normalizeStoreCode(row.storeCode);
    const host = hostnameFromUrl(row.userSiteUrl);
    if (!code || !host) continue;
    map[host] = code;
    if (host.startsWith('www.')) map[host.slice(4)] = code;
    else map[`www.${host}`] = code;
  }
  siteUrlCache = { at: now, map };
  return map;
}

async function resolvePublicStoreCode(req, explicitStoreCode) {
  const fromQuery = normalizeStoreCode(explicitStoreCode || '');
  if (fromQuery) return fromQuery;

  const host = extractPublicRequestHost(req);
  if (!host) return '';

  const staticMap = getPublicHostStoreMap();
  if (staticMap[host]) return staticMap[host];

  const fromSites = await hostMapFromUserSiteUrls();
  if (fromSites[host]) return fromSites[host];

  if (host === 'localhost' || host === '127.0.0.1') return 'dragonfury';
  return '';
}

async function resolvePublicStoreContext(req, explicitStoreCode) {
  const host = extractPublicRequestHost(req);
  const storeCode = await resolvePublicStoreCode(req, explicitStoreCode);
  const origin = publicOriginFromReq(req, host);
  return { host, storeCode, origin };
}

module.exports = {
  extractPublicRequestHost,
  publicOriginFromReq,
  resolvePublicStoreCode,
  resolvePublicStoreContext,
  getPublicHostStoreMap
};
