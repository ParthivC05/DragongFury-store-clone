import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

/**
 * Public blog list for this white-label store (defaults to VITE_STORE_CODE / dragonfury).
 */
export function getBlogList(params = {}) {
  const query = {
    store_code: params.store_code || params.storeCode || STORE_CODE
  };
  if (params.category) query.category = params.category;
  return getRequest(`${API_BASE}/api/blog`, query);
}

/**
 * Public blog detail by slug for this store.
 */
export function getBlogPost(slug, params = {}) {
  const query = {
    store_code: params.store_code || params.storeCode || STORE_CODE
  };
  return getRequest(`${API_BASE}/api/blog/${encodeURIComponent(slug)}`, query);
}
