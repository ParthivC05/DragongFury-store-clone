'use strict';

/** Bonus winnings (spin wheel, welcome signup, etc.) must be wagered 5× in games before withdrawal. */
const BONUS_PLAYTHROUGH_MULTIPLIER = 5;

/** Stores that enforce 5× bonus play-through on withdrawal (Dragon Fury only). */
const BONUS_PLAYTHROUGH_STORE_CODES = new Set(['dragonfury']);

/** @deprecated Prefer BONUS_PLAYTHROUGH_STORE_CODES / isBonusPlaythroughStore — kept for older imports. */
const BONUS_PLAYTHROUGH_STORE_CODE = 'dragonfury';

/** @deprecated Legacy export — Give/Get applies to all stores via settings. */
const GIVE_GET_REFERRAL_STORE_CODES = new Set();

/** Transaction types counted toward restricted bonus earnings for play-through. */
const BONUS_PLAYTHROUGH_TX_TYPES = [
  'spin_wheel',
  'welcome_signup',
  'referral_friend_signup',
  'daily_bonus',
  'daily_bonus_spin'
];

const WELCOME_SIGNUP_TX_TYPE = 'welcome_signup';

/** Same rules as auth storeBinding.helpers — keep store matching consistent. */
function normalizeStoreCode(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isBonusPlaythroughStore(storeCode) {
  return BONUS_PLAYTHROUGH_STORE_CODES.has(normalizeStoreCode(storeCode));
}

/** @deprecated Prefer affiliate settings.isGiveGet — all stores use Give/Get when a store code is present. */
function isGiveGetReferralStoreCode(storeCode) {
  return !!normalizeStoreCode(storeCode);
}

module.exports = {
  BONUS_PLAYTHROUGH_MULTIPLIER,
  BONUS_PLAYTHROUGH_STORE_CODE,
  BONUS_PLAYTHROUGH_STORE_CODES,
  GIVE_GET_REFERRAL_STORE_CODES,
  BONUS_PLAYTHROUGH_TX_TYPES,
  WELCOME_SIGNUP_TX_TYPE,
  normalizeStoreCode,
  isBonusPlaythroughStore,
  isGiveGetReferralStoreCode
};
