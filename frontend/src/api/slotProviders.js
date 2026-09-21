import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';
import { STORE_CODE } from '../config/site';

const SLOT_PROVIDERS_BASE = `${API_BASE}/api/slot-providers`;

export const DEFAULT_SLOT_PROVIDERS = {
  gitslotpark: true,
  bona: true,
  onegamehub: true,
  scorpio: true,
};

export function normalizeSlotProviders(data) {
  return {
    gitslotpark: data?.gitslotpark !== false,
    bona: data?.bona !== false,
    onegamehub: data?.onegamehub !== false,
    scorpio: data?.scorpio !== false,
  };
}

function pickProvidersPayload(res) {
  if (res?.providers && typeof res.providers === 'object') return res.providers;
  if (res?.data?.providers && typeof res.data.providers === 'object') return res.data.providers;
  if (res && typeof res === 'object' && ('onegamehub' in res || 'gitslotpark' in res || 'bona' in res || 'scorpio' in res)) {
    return res;
  }
  return null;
}

/** Public slot-provider flags for this store build. */
export function getSlotProvidersConfig(storeCode = STORE_CODE) {
  const query = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${SLOT_PROVIDERS_BASE}/config`, query).then((res) => {
    const payload = pickProvidersPayload(res);
    if (!payload) {
      throw new Error('Invalid slot providers response');
    }
    return normalizeSlotProviders(payload);
  });
}

/** Most-played casino games for this store's players. Public. */
export function getPopularSlotGames(storeCode = STORE_CODE, params = {}) {
  const query = {};
  if (storeCode) query.store_code = storeCode;
  if (params.limit != null) query.limit = params.limit;
  return getRequest(`${SLOT_PROVIDERS_BASE}/popular-games`, query);
}
