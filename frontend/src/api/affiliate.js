import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

const AFFILIATE_BASE = `${API_BASE}/api/affiliate`;

/**
 * Get current user's affiliate stats (code, referrals, earnings).
 * Use buildReferralLink(stats.referral_code) for share/copy URLs (current browser domain).
 * @returns {Promise<{ referral_code, referral_site_base_url, referral_link, total_referrals, total_earned_sc, reward_description, how_it_works_steps, referred_users, earnings }>}
 */
export function getAffiliateStats() {
  return getRequest(`${AFFILIATE_BASE}/stats`);
}

/**
 * Get public affiliate reward settings (for ticker / "How it works").
 * Passes store_code so guests see this store's Give/Get SC amounts.
 * @returns {Promise<{ friendSignupBonusSc, referrerRewardSc, ... }>}
 */
export function getAffiliateSettings(storeCode = STORE_CODE) {
  const params = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${AFFILIATE_BASE}/settings`, params);
}
