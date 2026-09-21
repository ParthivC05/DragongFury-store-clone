import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

/**
 * Public footer menus + page links for this store.
 */
export function getFooterMenus(params = {}) {
  const query = {
    store_code: params.store_code || params.storeCode || STORE_CODE
  };
  return getRequest(`${API_BASE}/api/footer`, query);
}

/**
 * Public footer page by slug for this store.
 */
export function getFooterPage(slug, params = {}) {
  const query = {
    store_code: params.store_code || params.storeCode || STORE_CODE
  };
  return getRequest(`${API_BASE}/api/footer/pages/${encodeURIComponent(slug)}`, query);
}
