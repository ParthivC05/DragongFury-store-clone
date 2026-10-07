import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

export function getHomePageSchema() {
  return getRequest(`${API_BASE}/api/page-schema/home`, { store_code: STORE_CODE });
}
