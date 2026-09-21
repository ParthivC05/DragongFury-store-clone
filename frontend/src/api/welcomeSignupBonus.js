import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

const BASE = `${API_BASE}/api/welcome-signup-bonus`;

/** Public landing settings for the guest welcome bonus modal. */
export function getWelcomeSignupBonusPublic(storeCode = STORE_CODE) {
  const params = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${BASE}/public`, params);
}
