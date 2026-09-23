'use strict';

const config = require('../../configs/app.config');
const { verifySign } = require('./gitslotparkSign.helpers');

const DEFAULT_BASE_URL = 'https://ptapi.loginxgamesapi.com';
const GIT_SLOTPARK_PROVIDERS = ['pragmatic', 'pgsoft', 'amatic', 'amusnet'];
const PROVIDER_ENV_INFIX = {
  pragmatic: '',
  pgsoft: 'PGSOFT_',
  amatic: 'AMATIC_',
  amusnet: 'AMUSNET_'
};
const AGENT_ID_ENV_RE = /^GIT_SLOTPARK_(?:(PGSOFT|AMATIC|AMUSNET)_)?AGENT_ID(?:_([A-Z0-9_]+))?$/;

function headerValue(req, name) {
  const raw = req && req.headers && req.headers[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

function envSuffix(storeCode) {
  return String(storeCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function envName(provider, field, storeCode) {
  const infix = PROVIDER_ENV_INFIX[provider] || '';
  const suffix = envSuffix(storeCode);
  const tail = suffix ? `_${suffix}` : '';
  return `GIT_SLOTPARK_${infix}${field}${tail}`;
}

function readProcessEnv(name) {
  return String(process.env[name] || '').trim();
}

function normalizeProvider(raw) {
  const provider = String(raw || 'pragmatic').trim().toLowerCase();
  return GIT_SLOTPARK_PROVIDERS.includes(provider) ? provider : 'pragmatic';
}

function resolveProviderFromRequest(req) {
  const fromHeader = headerValue(req, 'x-gitslotpark-provider');
  const fromQuery = req && req.query && req.query.provider;
  const fromBody = req && req.body && req.body.provider;
  return normalizeProvider(fromHeader || fromQuery || fromBody);
}

function resolveStoreCodeFromReq(req) {
  const fromUser = req?.user?.storeCode != null ? String(req.user.storeCode).trim() : '';
  const header = req?.headers && (req.headers['x-store-code'] || req.headers['x-storecode']);
  const fromHeader = header != null ? String(header).trim() : '';
  const fromQuery = req?.query?.store_code != null ? String(req.query.store_code).trim() : '';
  return fromUser || fromHeader || fromQuery || '';
}

/** Until DragonFury has its own GitSlotPark agents, reuse PlayJuwa store credentials. */
const GITSLOTPARK_STORE_CREDENTIAL_ALIAS = {
  dragonfury: 'playjuwa'
};

function resolveCredentialStoreCode(storeCode) {
  const code = String(storeCode || '').trim().toLowerCase();
  return GITSLOTPARK_STORE_CREDENTIAL_ALIAS[code] || code;
}

function emptyProviderConfig() {
  return { baseUrl: '', authToken: '', agentId: '', lobbyUrl: '', secretKey: '' };
}

function readNamedProviderConfig(provider, storeCode) {
  return {
    baseUrl: readProcessEnv(envName(provider, 'API_BASE_URL', storeCode)),
    authToken: readProcessEnv(envName(provider, 'AUTH_TOKEN', storeCode)),
    agentId: readProcessEnv(envName(provider, 'AGENT_ID', storeCode)),
    lobbyUrl: readProcessEnv(envName(provider, 'LOBBY_URL', storeCode)),
    secretKey: readProcessEnv(envName(provider, 'SECRET_KEY', storeCode))
  };
}

function readStoreProviderConfig(storeCode, provider) {
  if (!envSuffix(storeCode)) return emptyProviderConfig();
  return readNamedProviderConfig(provider, storeCode);
}

function readEnvProviderConfig(provider) {
  if (provider === 'pgsoft') {
    return {
      baseUrl: String(config.get('gitslotpark.pgsoft.baseUrl') || '').trim(),
      authToken: String(config.get('gitslotpark.pgsoft.authToken') || '').trim(),
      agentId: String(config.get('gitslotpark.pgsoft.agentId') || '').trim(),
      lobbyUrl: String(config.get('gitslotpark.pgsoft.lobbyUrl') || '').trim(),
      secretKey: String(config.get('gitslotpark.pgsoft.secretKey') || '').trim()
    };
  }

  if (provider === 'amatic') {
    return {
      baseUrl: String(config.get('gitslotpark.amatic.baseUrl') || '').trim(),
      authToken: String(config.get('gitslotpark.amatic.authToken') || '').trim(),
      agentId: String(config.get('gitslotpark.amatic.agentId') || '').trim(),
      lobbyUrl: String(config.get('gitslotpark.amatic.lobbyUrl') || '').trim(),
      secretKey: String(config.get('gitslotpark.amatic.secretKey') || '').trim()
    };
  }

  if (provider === 'amusnet') {
    return {
      baseUrl: String(config.get('gitslotpark.amusnet.baseUrl') || '').trim(),
      authToken: String(config.get('gitslotpark.amusnet.authToken') || '').trim(),
      agentId: String(config.get('gitslotpark.amusnet.agentId') || '').trim(),
      lobbyUrl: String(config.get('gitslotpark.amusnet.lobbyUrl') || '').trim(),
      secretKey: String(config.get('gitslotpark.amusnet.secretKey') || '').trim()
    };
  }

  return {
    baseUrl: String(config.get('gitslotpark.baseUrl') || DEFAULT_BASE_URL).trim(),
    authToken: String(config.get('gitslotpark.authToken') || '').trim(),
    agentId: String(config.get('gitslotpark.agentId') || '').trim(),
    lobbyUrl: String(config.get('gitslotpark.lobbyUrl') || '').trim(),
    secretKey: String(config.get('gitslotpark.secretKey') || '').trim()
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return '';
}

/**
 * Resolve GitSlotPark credentials for launch/catalog:
 * per-store backend env, then frontend headers, then unsuffixed backend env.
 */
function resolveGitslotparkConfig(req) {
  const provider = resolveProviderFromRequest(req);
  const storeCode = resolveStoreCodeFromReq(req);
  const credentialStore = resolveCredentialStoreCode(storeCode);
  const storeCfg = readStoreProviderConfig(credentialStore, provider);
  const envCfg = readEnvProviderConfig(provider);

  const headerBase = headerValue(req, 'x-gitslotpark-api-base-url');
  const headerToken = headerValue(req, 'x-gitslotpark-auth-token');
  const headerAgentId = headerValue(req, 'x-gitslotpark-agent-id');
  const headerLobbyUrl = headerValue(req, 'x-gitslotpark-lobby-url');

  const defaultBase = provider === 'pragmatic' ? DEFAULT_BASE_URL : '';
  const baseUrl = firstNonEmpty(storeCfg.baseUrl, headerBase, envCfg.baseUrl, defaultBase).replace(/\/+$/, '');
  const authToken = firstNonEmpty(storeCfg.authToken, headerToken, envCfg.authToken);
  const agentId = firstNonEmpty(storeCfg.agentId, headerAgentId, envCfg.agentId);
  const lobbyUrl = firstNonEmpty(storeCfg.lobbyUrl, headerLobbyUrl, envCfg.lobbyUrl).replace(/\/+$/, '');
  const secretKey = firstNonEmpty(storeCfg.secretKey, envCfg.secretKey);

  return { provider, storeCode, baseUrl, authToken, agentId, lobbyUrl, secretKey };
}

function infixToProvider(infix) {
  const key = String(infix || '').toLowerCase();
  return GIT_SLOTPARK_PROVIDERS.includes(key) ? key : 'pragmatic';
}

function listAllCallbackCredentials() {
  const seen = new Set();
  const out = [];

  function add(provider, agentId, secretKey, storeCode) {
    if (!agentId || !secretKey) return;
    const key = `${provider}|${storeCode || ''}|${agentId}|${secretKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ provider, agentId, secretKey, storeCode: storeCode || '' });
  }

  for (const provider of GIT_SLOTPARK_PROVIDERS) {
    const cfg = readEnvProviderConfig(provider);
    add(provider, cfg.agentId, cfg.secretKey, '');
  }

  for (const key of Object.keys(process.env)) {
    const match = key.match(AGENT_ID_ENV_RE);
    if (!match) continue;
    const provider = infixToProvider(match[1]);
    const storeSuffix = match[2] || '';
    const agentId = readProcessEnv(key);
    const secretName = envName(provider, 'SECRET_KEY', storeSuffix);
    const secretKey = readProcessEnv(secretName);
    add(provider, agentId, secretKey, storeSuffix);
  }

  return out;
}

function listGitslotparkCallbackConfigsByAgentId(agentID) {
  if (!agentID) return [];
  return listAllCallbackCredentials().filter((cfg) => cfg.agentId === agentID);
}

function resolveGitslotparkCallbackConfigByAgentId(agentID) {
  const matches = listGitslotparkCallbackConfigsByAgentId(agentID);
  return matches[0] || null;
}

/** When multiple providers/stores share the same agentID, pick the one whose secret validates the sign. */
function resolveGitslotparkCallbackConfigByAgentIdAndSign(agentID, signMessage, sign) {
  const matches = listGitslotparkCallbackConfigsByAgentId(agentID);
  if (!matches.length || !signMessage || !sign) return null;

  return matches.find((cfg) => verifySign(cfg.secretKey, signMessage, sign)) || null;
}

/** @deprecated Use resolveGitslotparkCallbackConfigByAgentId for multi-provider callbacks. */
function resolveGitslotparkCallbackConfig() {
  const all = listAllCallbackCredentials();
  if (all.length) return all[0];

  const pragmatic = readEnvProviderConfig('pragmatic');
  return { provider: 'pragmatic', ...pragmatic };
}

function isGitslotparkConfigured(req) {
  return Boolean(resolveGitslotparkConfig(req).authToken);
}

function isGitslotparkLaunchConfigured(req) {
  const { authToken, agentId, lobbyUrl } = resolveGitslotparkConfig(req);
  return Boolean(authToken && agentId && lobbyUrl);
}

function isGitslotparkCallbackConfigured() {
  return listAllCallbackCredentials().length > 0;
}

module.exports = {
  GIT_SLOTPARK_PROVIDERS,
  normalizeProvider,
  resolveProviderFromRequest,
  resolveStoreCodeFromReq,
  resolveGitslotparkConfig,
  resolveGitslotparkCallbackConfig,
  listGitslotparkCallbackConfigsByAgentId,
  resolveGitslotparkCallbackConfigByAgentId,
  resolveGitslotparkCallbackConfigByAgentIdAndSign,
  isGitslotparkConfigured,
  isGitslotparkLaunchConfigured,
  isGitslotparkCallbackConfigured
};
