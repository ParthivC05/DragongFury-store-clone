import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';
import { isBonaClientEnabled } from '../config/bona';

const BONA_BASE = `${API_BASE}/api/bona`;

let _statusCache = null;
let _statusPromise = null;

export function getBonaGames() {
  return getRequest(`${BONA_BASE}/games`);
}

export function launchBonaGame(gameid, coinType = 'SC') {
  return postRequest(`${BONA_BASE}/launch`, { gameid: Number(gameid), coinType });
}

export function settleBonaSession(payload = {}) {
  return postRequest(`${BONA_BASE}/settle`, payload);
}

export async function getBonaStatus(force = false) {
  if (!isBonaClientEnabled()) {
    return { configured: false, launchConfigured: false };
  }
  if (!force && _statusCache) return _statusCache;
  if (!force && _statusPromise) return _statusPromise;

  _statusPromise = getRequest(`${BONA_BASE}/status`)
    .then((res) => {
      _statusCache = {
        configured: Boolean(res?.configured),
        launchConfigured: Boolean(res?.launchConfigured),
        currency: res?.currency || 'SC'
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

export async function isBonaConfigured() {
  const status = await getBonaStatus();
  return Boolean(status.configured);
}

export { isBonaClientEnabled };
