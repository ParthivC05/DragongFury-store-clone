import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

/**
 * Public legal page (privacy, terms, responsible-gaming) for this store.
 */
export function getLegalPage(pageKey, params = {}) {
  const query = {
    store_code: params.store_code || params.storeCode || STORE_CODE
  };
  return getRequest(`${API_BASE}/api/legal/${encodeURIComponent(pageKey)}`, query);
}
