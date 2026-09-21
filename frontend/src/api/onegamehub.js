import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';
import { isOneGameHubClientEnabled } from '../config/onegamehub';

const ONEGAMEHUB_BASE = `${API_BASE}/api/onegamehub`;

let _statusCache = null;
let _statusPromise = null;

export function getOneGameHubGames() {
  return getRequest(`${ONEGAMEHUB_BASE}/games`);
}

export function launchOneGameHubGame(gameid) {
  return postRequest(`${ONEGAMEHUB_BASE}/launch`, { gameid: String(gameid) });
}

export function getOneGameHubRecentlyPlayed(params = {}) {
  return getRequest(`${ONEGAMEHUB_BASE}/recently-played`, params);
}

export async function getOneGameHubStatus(force = false) {
  if (!isOneGameHubClientEnabled()) {
    return { configured: false, launchConfigured: false };
  }
  if (!force && _statusCache) return _statusCache;
  if (!force && _statusPromise) return _statusPromise;

  _statusPromise = getRequest(`${ONEGAMEHUB_BASE}/status`)
    .then((res) => {
      _statusCache = {
        configured: Boolean(res?.configured),
        launchConfigured: Boolean(res?.launchConfigured),
        currency: res?.currency || 'SC',
        callbackUrl: res?.callbackUrl || ''
      };
      return _statusCache;
    })
    .catch(() => {
      _statusCache = { configured: false, launchConfigured: false };
      return _statusCache;
    })
    .finally(() => {
      _statusPromise = null;
    });

  return _statusPromise;
}

export async function isOneGameHubConfigured() {
  const status = await getOneGameHubStatus();
  return Boolean(status.configured);
}

export { isOneGameHubClientEnabled };
