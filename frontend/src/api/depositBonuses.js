import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

const DEPOSIT_BONUSES_BASE = `${API_BASE}/api/deposit-bonuses`;

const ELIGIBILITY_CACHE_MS = 30_000;
let eligibilityInflight = null;
let eligibilityCache = { data: null, ts: 0, valid: false };

export function invalidateDepositBonusEligibilityCache() {
  eligibilityCache = { data: null, ts: 0, valid: false };
}

/** Dedupe concurrent eligibility reads (Layout + Deposit mount together). */
export function getDepositBonusEligibility(options = {}) {
  const { force = false } = options;
  if (force) invalidateDepositBonusEligibilityCache();

  const now = Date.now();
  if (!force && eligibilityCache.valid && now - eligibilityCache.ts < ELIGIBILITY_CACHE_MS) {
    return Promise.resolve(eligibilityCache.data);
  }
  if (eligibilityInflight) return eligibilityInflight;

  eligibilityInflight = getRequest(`${DEPOSIT_BONUSES_BASE}/eligibility`)
    .then((data) => {
      eligibilityCache = { data, ts: Date.now(), valid: true };
      return data;
    })
    .catch((err) => {
      invalidateDepositBonusEligibilityCache();
      throw err;
    })
    .finally(() => {
      eligibilityInflight = null;
    });

  return eligibilityInflight;
}

/** Public landing-page promo tiers (1st–3rd deposit bonuses). */
export function getDepositBonusPromoPublic(storeCode = STORE_CODE) {
  const params = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${DEPOSIT_BONUSES_BASE}/public`, params);
}
