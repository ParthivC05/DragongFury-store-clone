import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

/**
 * Public Link2Play catalog for this white-label store (DragonFury).
 * Returns { games: [...] } shaped for the Link2Play UI.
 */
export function getLink2PlayGames(params = {}) {
  const query = {
    store_code: params.store_code || params.storeCode || STORE_CODE
  };
  return getRequest(`${API_BASE}/api/link2play`, query);
}
