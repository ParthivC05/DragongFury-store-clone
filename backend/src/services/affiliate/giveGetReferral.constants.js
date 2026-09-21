'use strict';

const { normalizeStoreCode: normalizeFromPlaythrough } = require('../wallet/bonusPlaythrough.constants');

/**
 * Give/Get defaults. Per-store programMode can be give_get or classic (commission).
 * Amounts / delay / cap / percent are per-store via affiliate_settings (admin).
 */
function isGiveGetReferralStore(storeCode) {
  return !!normalizeFromPlaythrough(storeCode);
}

function normalizeStoreCode(value) {
  return normalizeFromPlaythrough(value);
}

const FRIEND_SIGNUP_BONUS_SC = 15;
const REFERRER_REWARD_SC = 15;
const MIN_QUALIFYING_DEPOSIT_USD = 20;
const PAYOUT_DELAY_MINUTES = 24 * 60; // 24 hours
const PAYOUT_DELAY_HOURS = PAYOUT_DELAY_MINUTES / 60;
const WEEKLY_CAP_SC = 100;

const FRIEND_SIGNUP_TX_TYPE = 'referral_friend_signup';

const REWARD_STATUS = {
  AWAITING_PLAYTHROUGH: 'awaiting_playthrough',
  SCHEDULED: 'scheduled',
  PAID: 'paid',
  CAPPED: 'capped'
};

module.exports = {
  isGiveGetReferralStore,
  normalizeStoreCode,
  FRIEND_SIGNUP_BONUS_SC,
  REFERRER_REWARD_SC,
  MIN_QUALIFYING_DEPOSIT_USD,
  PAYOUT_DELAY_MINUTES,
  PAYOUT_DELAY_HOURS,
  WEEKLY_CAP_SC,
  FRIEND_SIGNUP_TX_TYPE,
  REWARD_STATUS
};
