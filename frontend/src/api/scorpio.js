import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const SCORPIO_BASE = `${API_BASE}/api/scorpio`;

let _statusCache = null;
let _statusPromise = null;

export function getScorpioGames() {
  return getRequest(`${SCORPIO_BASE}/games`);
}

export function launchScorpioGame({ gameCode, providerId, coinType = 'SC' } = {}) {
  const body = { coinType };
  if (gameCode) body.gameCode = String(gameCode);
  const provider = Number(providerId);
  if (Number.isFinite(provider) && provider > 0) body.providerId = provider;
  return postRequest(`${SCORPIO_BASE}/launch`, body);
}

export async function getScorpioStatus(force = false) {
  if (!force && _statusCache) return _statusCache;
  if (!force && _statusPromise) return _statusPromise;

  _statusPromise = getRequest(`${SCORPIO_BASE}/status`)
    .then((res) => {
      _statusCache = {
        enabled: res?.enabled !== false,
        configured: Boolean(res?.configured),
        launchConfigured: Boolean(res?.launchConfigured)
      };
      return _statusCache;
    })
    .catch(() => {
      _statusCache = { enabled: false, configured: false, launchConfigured: false };
      return _statusCache;
    })
    .finally(() => {
      _statusPromise = null;
    });

  return _statusPromise;
}
