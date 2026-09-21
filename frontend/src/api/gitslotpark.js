import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';
import {
  getGitslotparkRequestHeaders,
  normalizeGitslotparkProvider
} from '../config/gitslotpark';

const GIT_SLOTPARK_BASE = `${API_BASE}/api/gitslotpark`;

/** Fetch GitSlotPark slot catalog via backend proxy. */
export function getSlotGames(provider = 'pragmatic') {
  const normalized = normalizeGitslotparkProvider(provider);
  return getRequest(
    `${GIT_SLOTPARK_BASE}/games`,
    { provider: normalized },
    { headers: getGitslotparkRequestHeaders(normalized) }
  );
}

/** Distinct games the user has bet on (from slots transactions). Auth required. */
export function getRecentlyPlayedSlotGames(params = {}) {
  const query = {};
  if (params.limit != null) query.limit = params.limit;
  return getRequest(`${GIT_SLOTPARK_BASE}/recently-played`, query);
}

/** Launch a slot game and return the provider play URL. */
export function launchSlotGame(gameid, provider = 'pragmatic') {
  const normalized = normalizeGitslotparkProvider(provider);
  return postRequest(
    `${GIT_SLOTPARK_BASE}/launch`,
    { gameid: Number(gameid), provider: normalized },
    { headers: getGitslotparkRequestHeaders(normalized) }
  );
}

export {
  GIT_SLOTPARK_PROVIDERS,
  isGitslotparkConfigured,
  isGitslotparkLaunchConfigured,
  listConfiguredGitslotparkProviders,
  getGitslotparkProviderMeta,
  getGitslotparkLaunchMode,
  normalizeGitslotparkProvider
} from '../config/gitslotpark';
