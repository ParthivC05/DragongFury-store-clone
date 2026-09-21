'use strict';

const DEFAULT_BASE_URLS = {
  pragmatic: 'https://apipt.slotgamesapi.com',
  pgsoft: '',
  amatic: '',
  amusnet: ''
};

const PROVIDER_META = {
  pragmatic: {
    id: 'pragmatic',
    label: 'Pragmatic Play',
    envKeys: {
      baseUrl: 'VITE_GIT_SLOTPARK_API_BASE_URL',
      authToken: 'VITE_GIT_SLOTPARK_AUTH_TOKEN',
      agentId: 'VITE_GIT_SLOTPARK_AGENT_ID',
      lobbyUrl: 'VITE_GIT_SLOTPARK_LOBBY_URL'
    }
  },
  pgsoft: {
    id: 'pgsoft',
    label: 'PG Soft',
    envKeys: {
      baseUrl: 'VITE_GIT_SLOTPARK_PGSOFT_API_BASE_URL',
      authToken: 'VITE_GIT_SLOTPARK_PGSOFT_AUTH_TOKEN',
      agentId: 'VITE_GIT_SLOTPARK_PGSOFT_AGENT_ID',
      lobbyUrl: 'VITE_GIT_SLOTPARK_PGSOFT_LOBBY_URL'
    }
  },
  amatic: {
    id: 'amatic',
    label: 'Amatic',
    envKeys: {
      baseUrl: 'VITE_GIT_SLOTPARK_AMATIC_API_BASE_URL',
      authToken: 'VITE_GIT_SLOTPARK_AMATIC_AUTH_TOKEN',
      agentId: 'VITE_GIT_SLOTPARK_AMATIC_AGENT_ID',
      lobbyUrl: 'VITE_GIT_SLOTPARK_AMATIC_LOBBY_URL'
    }
  },
  amusnet: {
    id: 'amusnet',
    label: 'Amusnet',
    envKeys: {
      baseUrl: 'VITE_GIT_SLOTPARK_AMUSNET_API_BASE_URL',
      authToken: 'VITE_GIT_SLOTPARK_AMUSNET_AUTH_TOKEN',
      agentId: 'VITE_GIT_SLOTPARK_AMUSNET_AGENT_ID',
      lobbyUrl: 'VITE_GIT_SLOTPARK_AMUSNET_LOBBY_URL'
    }
  }
};

export const GIT_SLOTPARK_PROVIDERS = Object.keys(PROVIDER_META);

function readEnv(key) {
  return String(import.meta.env[key] || '').trim();
}

function resolveLobbyUrl(envKey) {
  const trimmed = readEnv(envKey).replace(/\/+$/, '');
  if (!trimmed) {
    return typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '';
  }

  if (typeof window === 'undefined') {
    return trimmed;
  }

  try {
    const configured = new URL(trimmed);
    const current = window.location;
    if (
      configured.hostname === 'localhost' &&
      current.hostname === 'localhost' &&
      configured.port !== current.port
    ) {
      return `${current.origin}${configured.pathname || ''}`.replace(/\/+$/, '');
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function normalizeGitslotparkProvider(provider) {
  const normalized = String(provider || 'pragmatic').trim().toLowerCase();
  return GIT_SLOTPARK_PROVIDERS.includes(normalized) ? normalized : 'pragmatic';
}

export function getGitslotparkProviderMeta(provider = 'pragmatic') {
  return PROVIDER_META[normalizeGitslotparkProvider(provider)] || PROVIDER_META.pragmatic;
}

export function getGitslotparkConfig(provider = 'pragmatic') {
  const normalized = normalizeGitslotparkProvider(provider);
  const meta = getGitslotparkProviderMeta(normalized);
  const { envKeys } = meta;

  const baseUrl = readEnv(envKeys.baseUrl) || DEFAULT_BASE_URLS[normalized] || '';
  const authToken = readEnv(envKeys.authToken);
  const agentId = readEnv(envKeys.agentId);
  const lobbyUrl = resolveLobbyUrl(envKeys.lobbyUrl);

  return {
    provider: normalized,
    label: meta.label,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authToken,
    agentId,
    lobbyUrl
  };
}

export function isGitslotparkConfigured(provider = 'pragmatic') {
  return Boolean(getGitslotparkConfig(provider).authToken);
}

export function isGitslotparkLaunchConfigured(provider = 'pragmatic') {
  const { authToken, agentId, lobbyUrl } = getGitslotparkConfig(provider);
  return Boolean(authToken && agentId && lobbyUrl);
}

export function listConfiguredGitslotparkProviders() {
  return GIT_SLOTPARK_PROVIDERS.filter((provider) => isGitslotparkConfigured(provider));
}

export function getGitslotparkRequestHeaders(provider = 'pragmatic') {
  const { baseUrl, authToken, agentId, lobbyUrl } = getGitslotparkConfig(provider);
  const headers = {
    'X-GitSlotPark-Provider': normalizeGitslotparkProvider(provider)
  };

  if (authToken) headers['X-GitSlotPark-Auth-Token'] = authToken;
  if (baseUrl) headers['X-GitSlotPark-Api-Base-Url'] = baseUrl;
  if (agentId) headers['X-GitSlotPark-Agent-Id'] = agentId;
  if (lobbyUrl) headers['X-GitSlotPark-Lobby-Url'] = lobbyUrl;

  return headers;
}

/** iframe (default) or tab — tab opens the provider URL in a new browser tab instead of the overlay. */
export function getGitslotparkLaunchMode() {
  const mode = String(import.meta.env.VITE_GIT_SLOTPARK_LAUNCH_MODE || 'iframe').trim().toLowerCase();
  return mode === 'tab' ? 'tab' : 'iframe';
}
