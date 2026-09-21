import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';
import { STORE_CODE } from '../config/site';

const SOCIAL_LINKS_BASE = `${API_BASE}/api/social-links`;

/** Public landing-page social links for the current store build. */
export function getSocialLinksConfig(storeCode = STORE_CODE) {
  const query = storeCode ? { store_code: storeCode } : undefined;
  return getRequest(`${SOCIAL_LINKS_BASE}/config`, query).then((res) => {
    const links = res?.socialLinks ?? res;
    return {
      facebook: links?.facebook || '',
      telegram: links?.telegram || '',
      messenger: links?.messenger || '',
    };
  });
}
