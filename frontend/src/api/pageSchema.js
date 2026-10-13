import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

export function getHomePageSchema() {
  return getRequest(`${API_BASE}/api/page-schema/home`, { store_code: STORE_CODE });
}


export function getCommonPageSeo() {
  return getRequest(`${API_BASE}/api/page-seo`, { store_code: STORE_CODE });
}
