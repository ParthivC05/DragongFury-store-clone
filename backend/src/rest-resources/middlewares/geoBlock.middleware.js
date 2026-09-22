'use strict';

const { isIP } = require('node:net');
const axios = require('axios');
const config = require('../../configs/app.config');
const { sendError } = require('../../helpers/response.helpers');
const { isIpAllowlisted, normalizeIp, resolveStoreCodeForGeoRequest } = require('../../services/geo/ipAllowlist.service');
const { isGeoBlockEnabledForStore } = require('../../services/geo/geoBlockSettings.service');
const { isSearchCrawler } = require('../../utils/searchCrawler');

/** Restricted US states — empty: all US states are allowed. */
const RESTRICTED_STATES = [];

/**
 * Partner Platform country allowlist.
 * Intentionally excludes India (IN) — unlike Orionstars which allows IN.
 * Dubai city remains an exception outside the country list.
 * US territories use their own ISO country codes (ipgeolocation does not return US).
 */
const ALLOWED_COUNTRIES = [
  'US',
  'CA', // Canada
  'MX', // Mexico
  'NP',
  'PR', // Puerto Rico
  'GU', // Guam
  'VI', // U.S. Virgin Islands
  'AS', // American Samoa
  'MP', // Northern Mariana Islands
  'UM', // U.S. Minor Outlying Islands (Wake, Midway, etc.)
  // Caribbean
  'JM', // Jamaica
  'DO', // Dominican Republic
  'TT', // Trinidad & Tobago
  'BS', // Bahamas
  'BB', // Barbados
  'CU', // Cuba
  'HT', // Haiti
  'AW', // Aruba
  'CW', // Curaçao
  'KY', // Cayman Islands
  'VG', // British Virgin Islands
  'TC', // Turks & Caicos
  'GD', // Grenada
  'LC', // Saint Lucia
  'VC', // Saint Vincent & the Grenadines
  'AG', // Antigua & Barbuda
  'KN', // Saint Kitts & Nevis
  'DM', // Dominica
  'MQ', // Martinique
  'GP', // Guadeloupe
  'MS', // Montserrat
  'BL', // Saint Barthélemy
  'MF', // Saint Martin
  'SX', // Sint Maarten
  'AI' // Anguilla
];

const GEO_ERROR = {
  IP_NOT_FOUND: {
    code: 3001,
    status: 400,
    message: 'Unable to determine IP address.'
  },
  PERMISSION_DENIED: {
    code: 3047,
    status: 406,
    message: 'Permission Denied'
  },
  GEO_BLOCKED_LOCATION: {
    code: 3051,
    status: 406,
    message: 'Access Denied: You are not allowed to access this service from your current location.'
  },
  VPN_DETECTED: {
    code: 3054,
    status: 406,
    message: 'Access Denied: VPN connection detected.'
  },
  NON_US_COUNTRY_BLOCKED: {
    code: 3055,
    status: 406,
    message:
      'Access Denied: This service is only available within the United States (with limited exceptions).'
  }
};

/** Cloudflare published IPv4 ranges (edge/proxy — never treat as the end-user). */
const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22'
];

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InCidr(ip, cidr) {
  const [network, prefixLength] = cidr.split('/');
  const prefix = Number(prefixLength);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
  if (isIP(network) !== 4 || isIP(ip) !== 4) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

function isCloudflareIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || isIP(normalized) !== 4) return false;
  return CLOUDFLARE_IPV4_CIDRS.some((cidr) => isIpv4InCidr(normalized, cidr));
}

function isPrivateOrLocalIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || !isIP(normalized)) return false;

  const version = isIP(normalized);
  if (version === 4) {
    const [a, b] = normalized.split('.').map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    // Cloudflare Pseudo IPv4 (Class E) — not a real client address for allowlisting.
    if (a >= 240) return true;
    return false;
  }

  if (version === 6) {
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80')) return true;
  }

  return false;
}

/**
 * Prefer real public IPv4 over IPv6 (browsers often hit Cloudflare on IPv6 while
 * admins allowlist IPv4). Never prefer Cloudflare edge addresses.
 */
function pickBestIp(candidates) {
  const publicV4 = [];
  const publicV6 = [];
  const privateIps = [];

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (!normalized || !isIP(normalized)) continue;
    if (isCloudflareIp(normalized)) continue;
    if (isPrivateOrLocalIp(normalized)) {
      privateIps.push(normalized);
      continue;
    }
    if (isIP(normalized) === 4) publicV4.push(normalized);
    else publicV6.push(normalized);
  }

  return publicV4[0] || publicV6[0] || privateIps[0] || null;
}

function collectIpCandidates(req) {
  const candidates = [];
  if (!req?.headers) return candidates;

  const ipHeaders = [
    // Real visitor IP from Cloudflare (may be IPv6 on dual-stack).
    'cf-connecting-ip',
    'true-client-ip',
    'fastly-client-ip',
    'x-real-ip',
    'x-client-ip',
    'x-cluster-client-ip',
    // Only useful as last resort; Class E pseudo address, not the user's IPv4.
    'cf-pseudo-ipv4'
  ];

  for (const header of ipHeaders) {
    const value = req.headers[header];
    if (value) candidates.push(value);
  }

  if (req.headers['x-forwarded-for']) {
    const forwarded = String(req.headers['x-forwarded-for'])
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    candidates.push(...forwarded);
  }

  if (req.headers.forwarded) {
    const forwarded = String(req.headers.forwarded);
    const forMatch = forwarded.match(/for=(?:"?\[?)([a-fA-F0-9:.]+)(?:"?\]?)/i);
    if (forMatch?.[1]) candidates.push(forMatch[1]);
  }

  candidates.push(
    req.connection?.remoteAddress,
    req.socket?.remoteAddress,
    req.connection?.socket?.remoteAddress,
    req.info?.remoteAddress,
    req.requestContext?.identity?.sourceIp,
    req.ip
  );

  return candidates;
}

function getClientIp(req) {
  return pickBestIp(collectIpCandidates(req));
}

function getPublicIpCandidates(req) {
  const seen = new Set();
  const out = [];
  for (const candidate of collectIpCandidates(req)) {
    const normalized = normalizeIp(candidate);
    if (!normalized || !isIP(normalized)) continue;
    if (isPrivateOrLocalIp(normalized) || isCloudflareIp(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  // Prefer IPv4 first for allowlist checks (matches how admins usually paste IPs).
  out.sort((a, b) => {
    const av = isIP(a);
    const bv = isIP(b);
    if (av === bv) return 0;
    return av === 4 ? -1 : 1;
  });
  return out;
}

function summarizeRequestIps(req) {
  return {
    cfConnectingIp: req.headers?.['cf-connecting-ip'] || null,
    cfPseudoIpv4: req.headers?.['cf-pseudo-ipv4'] || null,
    xRealIp: req.headers?.['x-real-ip'] || null,
    xForwardedFor: req.headers?.['x-forwarded-for'] || null,
    chosenIp: getClientIp(req),
    publicCandidates: getPublicIpCandidates(req)
  };
}

function summarizeGeoProvider(geoData, resolvedIp, usedCallerIpFallback) {
  const location = geoData?.location || {};
  return {
    providerIp: resolvedIp || geoData?.ip || geoData?.ip_address || null,
    usedCallerIpFallback: Boolean(usedCallerIpFallback),
    countryCode: location.country_code2 || geoData?.country_code2 || null,
    countryName: location.country_name || geoData?.country_name || null,
    stateCode: location.state_code || geoData?.state_code || null,
    city: location.city || geoData?.city || null,
    isVpn: geoData?.security?.is_vpn === true,
    proxyType: geoData?.security?.proxy_type || null
  };
}

async function isRequestAllowlisted(req, storeCode) {
  for (const ip of getPublicIpCandidates(req)) {
    if (await isIpAllowlisted(ip, storeCode)) return { allowed: true, matchedIp: ip };
  }
  const fallback = getClientIp(req);
  if (fallback && (await isIpAllowlisted(fallback, storeCode))) {
    return { allowed: true, matchedIp: fallback };
  }
  return { allowed: false, matchedIp: null };
}

function rejectGeo(res, key, context = {}) {
  const err = GEO_ERROR[key] || GEO_ERROR.PERMISSION_DENIED;
  console.warn('[geo] denied', {
    ...context,
    decision: 'deny',
    reason: key,
    response: { status: err.status, code: err.code, message: err.message }
  });
  return sendError(res, err.message, err.status, err.code);
}

async function fetchGeoData(geoApiBaseUrl, geoApiKey, ip) {
  const params = { apiKey: geoApiKey, include: 'security' };
  const usedCallerIpFallback = !ip || isPrivateOrLocalIp(ip) || isCloudflareIp(ip);

  if (!usedCallerIpFallback) {
    params.ip = ip;
  }

  try {
    const response = await axios.get(geoApiBaseUrl, {
      params,
      timeout: config.get('http.thirdPartyTimeoutMs') || 60000
    });
    return { data: response.data, usedCallerIpFallback };
  } catch (error) {
    const status = error?.response?.status;
    if (status === 423 && params.ip) {
      const fallback = await axios.get(geoApiBaseUrl, {
        params: { apiKey: geoApiKey, include: 'security' },
        timeout: config.get('http.thirdPartyTimeoutMs') || 60000
      });
      return { data: fallback.data, usedCallerIpFallback: true };
    }
    throw error;
  }
}

function extractResolvedIp(geoData) {
  const candidates = [
    geoData?.ip,
    geoData?.ip_address,
    geoData?.IPv4,
    geoData?.ipv4
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized && !isPrivateOrLocalIp(normalized) && !isCloudflareIp(normalized)) {
      return normalized;
    }
  }
  return null;
}

function enforceGeoRules(data, res, next, context = {}) {
  const state = data?.location?.state_code || data?.state_code;
  const countryCode = data?.location?.country_code2 || data?.country_code2;
  const security = data?.security;

  if (RESTRICTED_STATES.includes(state)) {
    return rejectGeo(res, 'GEO_BLOCKED_LOCATION', {
      ...context,
      ruleDetail: `Restricted US state: ${state}`
    });
  }

  const proxyType = String(security?.proxy_type || '').toUpperCase();
  const vpnDetected = security?.is_vpn === true || proxyType === 'VPN';

  const cityName = String(data?.location?.city || data?.city || '')
    .toLowerCase()
    .trim();
  const isDubai = cityName === 'dubai';
  const inAllowedRegion = ALLOWED_COUNTRIES.includes(countryCode) || isDubai;

  if (vpnDetected && inAllowedRegion) {
    console.info('[geo] allowed', {
      ...context,
      decision: 'allow',
      reason: isDubai ? 'ALLOWED_DUBAI_VPN' : 'ALLOWED_REGION_VPN',
      ruleDetail: `VPN flag ignored for allowed region (country=${countryCode || 'unknown'}, proxy_type=${proxyType || 'n/a'})`,
      response: { status: 200, code: null, message: 'VPN flagged inside an allowed region' }
    });
    return next();
  }

  if (vpnDetected) {
    return rejectGeo(res, 'VPN_DETECTED', {
      ...context,
      ruleDetail: `VPN/proxy detected outside allowed regions (country=${countryCode || 'unknown'}, proxy_type=${proxyType || 'n/a'})`
    });
  }

  if (!inAllowedRegion) {
    return rejectGeo(res, 'NON_US_COUNTRY_BLOCKED', {
      ...context,
      ruleDetail: `Country ${countryCode || 'unknown'} not in allowlist [${ALLOWED_COUNTRIES.join(', ')}]`
    });
  }

  console.info('[geo] allowed', {
    ...context,
    decision: 'allow',
    reason: isDubai ? 'ALLOWED_DUBAI' : 'ALLOWED_COUNTRY',
    response: { status: 200, code: null, message: 'passed geo rules' }
  });
  return next();
}

/**
 * Geo / VPN gate for all partner-store user traffic.
 * Skips when DISABLE_GEO_BLOCK=true, the store geo switch is off, or IPGEO credentials missing.
 * A VPN flag is allowed when the resolved country is already in the allowlist.
 * Allowlisted IPs (admin DB + GEO_IP_ALLOWLIST env) bypass the provider check.
 * Store code from query/body scopes the per-store IP allowlist.
 */
function geoBlock() {
  return async function geoBlockMiddleware(req, res, next) {
    const path = req.originalUrl || req.url;
    try {
      if (config.get('geo.disableGeoBlock')) {
        return next();
      }

      if (isSearchCrawler(req.headers['user-agent'])) {
        return next();
      }

      const storeCode = resolveStoreCodeForGeoRequest(req);
      if (storeCode && !(await isGeoBlockEnabledForStore(storeCode))) {
        console.info('[geo] skipped', {
          storeCode,
          path,
          decision: 'allow',
          reason: 'STORE_GEO_BLOCK_DISABLED',
          response: { status: 200, code: null, message: 'geo blocking off for this store' }
        });
        return next();
      }

      const requestIps = summarizeRequestIps(req);
      const ip = requestIps.chosenIp;
      const baseCtx = { storeCode, path, requestIps };

      if (!ip) {
        return rejectGeo(res, 'IP_NOT_FOUND', baseCtx);
      }

      const allow = await isRequestAllowlisted(req, storeCode);
      if (allow.allowed) {
        console.info('[geo] allowlisted', {
          ...baseCtx,
          decision: 'allow',
          reason: 'ALLOWLIST',
          matchedIp: allow.matchedIp,
          chosenIp: ip,
          response: { status: 200, code: null, message: 'IP allowlisted' }
        });
        return next();
      }

      const geoApiBaseUrl = config.get('geo.url');
      const geoApiKey = config.get('geo.apiKey');
      if (!geoApiBaseUrl || !geoApiKey) {
        console.warn('[geo] skipped', {
          ...baseCtx,
          decision: 'allow',
          reason: 'GEO_PROVIDER_NOT_CONFIGURED',
          response: { status: 200, code: null, message: 'IPGEO_URL / IPGEO_API_KEY missing' }
        });
        return next();
      }

      const { data: geoData, usedCallerIpFallback } = await fetchGeoData(geoApiBaseUrl, geoApiKey, ip);
      const resolvedIp = extractResolvedIp(geoData);
      const provider = summarizeGeoProvider(geoData, resolvedIp, usedCallerIpFallback);
      const ctx = {
        ...baseCtx,
        lookupIp: ip,
        provider,
        hint:
          isIP(ip) === 6
            ? 'Client connected via IPv6 (common behind Cloudflare). Allowlist the IPv6 address (or a /64 prefix), not only the IPv4 from ipify.'
            : null
      };

      console.info('[geo] provider lookup', {
        storeCode,
        lookupIp: ip,
        ...provider,
        path
      });

      if (resolvedIp && (await isIpAllowlisted(resolvedIp, storeCode))) {
        console.info('[geo] allowlisted via provider IP', {
          ...ctx,
          decision: 'allow',
          reason: 'ALLOWLIST_PROVIDER_IP',
          matchedIp: resolvedIp,
          response: { status: 200, code: null, message: 'Provider IP allowlisted' }
        });
        return next();
      }

      return enforceGeoRules(geoData, res, next, ctx);
    } catch (error) {
      const status = error?.response?.status;
      const providerBody = error?.response?.data;
      const storeCode = resolveStoreCodeForGeoRequest(req);
      const requestIps = summarizeRequestIps(req);
      // Timeout / rate-limit / provider outage is not a geo denial. A second
      // concurrent check (React StrictMode, dual-stack retry) was turning this
      // into 406 and blocking allowlisted users.
      console.error('[geo] provider error; allowing access', {
        decision: 'allow',
        reason: 'PROVIDER_ERROR_FAIL_OPEN',
        path,
        storeCode,
        requestIps,
        providerHttpStatus: status || null,
        errorMessage: error?.message || String(error),
        providerBody: providerBody || null,
        response: { status: 200, code: null, message: 'geo provider unavailable' }
      });
      return next();
    }
  };
}

module.exports = {
  geoBlock,
  getClientIp,
  getPublicIpCandidates,
  isPrivateOrLocalIp,
  isCloudflareIp,
  GEO_ERROR,
  ALLOWED_COUNTRIES,
  RESTRICTED_STATES
};
