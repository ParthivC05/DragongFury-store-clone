'use strict';

const config = require('../../configs/app.config');

function publicBaseUrl() {
  return String(process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function envSuffix(storeCode) {
  return String(storeCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function parseAccountsJson() {
  const raw = String(process.env.GAMEHUB1_ACCOUNTS || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      const code = String(key || '').trim().toLowerCase();
      if (!code || !value || typeof value !== 'object') continue;
      out[code] = {
        baseUrl: String(value.baseUrl || value.rpc || value.url || '').trim(),
        secretToken: String(value.secretToken || value.secret || value.token || '').trim(),
        hmacSalt: String(value.hmacSalt || value.hmac || value.salt || '').trim()
      };
    }
    return out;
  } catch {
    return {};
  }
}

function readEnvAccount(storeCode) {
  const suffix = envSuffix(storeCode);
  if (!suffix) return null;
  const baseUrl = String(process.env[`GAMEHUB1_BASE_URL_${suffix}`] || '').trim();
  const secretToken = String(process.env[`GAMEHUB1_SECRET_TOKEN_${suffix}`] || '').trim();
  const hmacSalt = String(process.env[`GAMEHUB1_HMAC_SALT_${suffix}`] || '').trim();
  if (!baseUrl && !secretToken && !hmacSalt) return null;
  return { baseUrl, secretToken, hmacSalt };
}

function readDefaultAccount() {
  return {
    baseUrl: String(config.get('onegamehub.baseUrl') || '').trim(),
    secretToken: String(config.get('onegamehub.secretToken') || '').trim(),
    hmacSalt: String(config.get('onegamehub.hmacSalt') || '').trim()
  };
}

function resolveOneGameHubConfig(storeCode) {
  const code = String(storeCode || '').trim();
  const fromEnv = readEnvAccount(code);
  if (fromEnv && fromEnv.baseUrl && fromEnv.secretToken) {
    return { ...fromEnv, publicBaseUrl: publicBaseUrl(), storeCode: code };
  }

  const fromJson = parseAccountsJson()[code.toLowerCase()];
  if (fromJson && fromJson.baseUrl && fromJson.secretToken) {
    return { ...fromJson, publicBaseUrl: publicBaseUrl(), storeCode: code };
  }

  // Default GAMEHUB1_* is casinoslots (and unknown/empty store on legacy calls).
  if (!code || code.toLowerCase() === 'casinoslots') {
    return { ...readDefaultAccount(), publicBaseUrl: publicBaseUrl(), storeCode: code || 'casinoslots' };
  }

  return {
    baseUrl: '',
    secretToken: '',
    hmacSalt: '',
    publicBaseUrl: publicBaseUrl(),
    storeCode: code
  };
}

function isOneGameHubConfigured(storeCode) {
  const { baseUrl, secretToken } = resolveOneGameHubConfig(storeCode);
  return Boolean(baseUrl && secretToken);
}

function isOneGameHubLaunchConfigured(storeCode) {
  const { hmacSalt } = resolveOneGameHubConfig(storeCode);
  return isOneGameHubConfigured(storeCode) && Boolean(hmacSalt);
}

function getCallbackUrl() {
  const base = publicBaseUrl();
  if (!base) return '';
  return `${base}/api/onegamehub/callback`;
}

function listHmacSalts(storeCode) {
  const preferred = resolveOneGameHubConfig(storeCode).hmacSalt;
  const salts = [];
  if (preferred) salts.push(preferred);

  const def = readDefaultAccount().hmacSalt;
  if (def && !salts.includes(def)) salts.push(def);

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GAMEHUB1_HMAC_SALT')) continue;
    const salt = String(value || '').trim();
    if (salt && !salts.includes(salt)) salts.push(salt);
  }

  for (const account of Object.values(parseAccountsJson())) {
    const salt = String(account.hmacSalt || '').trim();
    if (salt && !salts.includes(salt)) salts.push(salt);
  }

  return salts;
}

function resolveStoreCodeFromReq(req) {
  const header = req?.headers && (req.headers['x-store-code'] || req.headers['x-storecode']);
  const fromHeader = header != null ? String(header).trim() : '';
  const fromQuery = req?.query?.store_code != null ? String(req.query.store_code).trim() : '';
  const fromUser = req?.user?.storeCode != null ? String(req.user.storeCode).trim() : '';
  return fromUser || fromQuery || fromHeader || '';
}

module.exports = {
  resolveOneGameHubConfig,
  isOneGameHubConfigured,
  isOneGameHubLaunchConfigured,
  getCallbackUrl,
  listHmacSalts,
  resolveStoreCodeFromReq
};
