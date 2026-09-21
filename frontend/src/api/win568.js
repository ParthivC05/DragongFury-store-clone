import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const WIN568_BASE = `${API_BASE}/api/win568`;

let _statusCache = null;
let _statusPromise = null;

export function getWin568Games() {
  return getRequest(`${WIN568_BASE}/games`);
}

export function launchWin568Game({ gameid, gpid, portfolio } = {}) {
  const body = {};
  const gp = Number(gpid);
  const gid = Number(gameid);
  if (Number.isFinite(gp) && gp >= 0) body.gpid = gp;
  if (Number.isFinite(gid)) body.gameid = gid;
  if (portfolio) body.portfolio = String(portfolio);
  return postRequest(`${WIN568_BASE}/launch`, body);
}

export async function getWin568Status(force = false) {
  if (!force && _statusCache) return _statusCache;
  if (!force && _statusPromise) return _statusPromise;

  _statusPromise = getRequest(`${WIN568_BASE}/status`)
    .then((res) => {
      _statusCache = {
        configured: Boolean(res?.configured),
        launchConfigured: Boolean(res?.launchConfigured)
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
