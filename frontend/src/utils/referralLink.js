/**
 * Browser-origin referral share links.
 *
 * Display/copy/share URLs use the domain the user is on (e.g. new.dragonfury.com vs dragonfury.com).
 * Refer & Earn rewards are unaffected: signup reads `?ref=` and the backend links by
 * `userReferralCode` only — not by link domain.
 */

/** @returns {string} Current site origin without trailing slash, or '' when unavailable. */
export function getReferralShareBaseUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const { origin, protocol } = window.location;
    if (!origin || origin === 'null') return '';
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return origin.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * @param {string | null | undefined} referralCode
 * @returns {string} Shareable /register?ref= URL for the current origin, or ''.
 */
export function buildReferralLink(referralCode) {
  const code = referralCode != null ? String(referralCode).trim() : '';
  if (!code) return '';
  const baseUrl = getReferralShareBaseUrl();
  if (!baseUrl) return '';
  return `${baseUrl}/register?ref=${encodeURIComponent(code)}`;
}

/**
 * @param {{ referral_code?: string } | null | undefined} stats Affiliate API payload.
 * @returns {string}
 */
export function getReferralLinkFromStats(stats) {
  return buildReferralLink(stats?.referral_code);
}
