import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

export function getGamePages() {
  return getRequest(`${API_BASE}/api/game-pages`, { store_code: STORE_CODE });
}

export function getGamePage(slug) {
  return getRequest(`${API_BASE}/api/game-pages/${encodeURIComponent(slug)}`, { store_code: STORE_CODE });
}
