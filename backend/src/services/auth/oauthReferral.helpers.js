'use strict';

/**
 * Resolve optional friend referral code for OAuth signup.
 * Invalid codes are ignored so SSO signup is not blocked.
 */
async function resolveOptionalReferralForOauth(rawRef) {
  const trimmed = rawRef != null ? String(rawRef).trim() : '';
  if (!trimmed) return { referredByUserId: null, distributorCode: null, storeCode: null };

  try {
    const db = require('../../db/models');
    const referralUpper = trimmed.toUpperCase();
    const referrer = await db.User.findOne({
      where: { userReferralCode: referralUpper },
      attributes: ['userId', 'distributorCode', 'storeCode']
    });
    if (!referrer) return { referredByUserId: null, distributorCode: null, storeCode: null };
    return {
      referredByUserId: referrer.userId,
      distributorCode: referrer.distributorCode || null,
      storeCode: referrer.storeCode || null
    };
  } catch (_) {
    return { referredByUserId: null, distributorCode: null, storeCode: null };
  }
}

function pickReferralFromOptions(options = {}) {
  const raw =
    (options.ref != null && String(options.ref).trim()) ||
    (options.affiliateCode != null && String(options.affiliateCode).trim()) ||
    '';
  return raw;
}

module.exports = {
  resolveOptionalReferralForOauth,
  pickReferralFromOptions
};
