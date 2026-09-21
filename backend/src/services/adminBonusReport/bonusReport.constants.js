'use strict';

/** Report-only synthetic type: extra SC on package purchases (credit − pay). Not a real user_transactions.type. */
const PACKAGE_EXTRA_TYPE = 'package_extra';

/** Real wallet transaction types that count as free / promotional bonuses (not real money). */
const REAL_BONUS_TX_TYPES = [
  'welcome_signup',
  'bonus_code',
  'daily_bonus',
  'daily_bonus_spin',
  'promotion',
  'vip_bonus',
  'affiliate',
  'referral_friend_signup',
  'spin_wheel'
];

/** All bonus-report types (includes package extra SC derived from deposits). */
const BONUS_TX_TYPES = [...REAL_BONUS_TX_TYPES, PACKAGE_EXTRA_TYPE];

/** Plain-language labels for store admins (non-technical). */
const BONUS_TYPE_LABELS = {
  welcome_signup: 'Welcome signup',
  bonus_code: 'Bonus code',
  daily_bonus: 'Daily bonus',
  daily_bonus_spin: 'Daily bonus spin',
  promotion: 'Promotion',
  vip_bonus: 'VIP reward',
  affiliate: 'Refer & Earn',
  referral_friend_signup: 'Friend signup bonus',
  spin_wheel: 'Spin wheel',
  package_extra: 'Package extra SC'
};

/** Short help text for each bonus kind. */
const BONUS_TYPE_HINTS = {
  welcome_signup: 'Free SC given once when a player creates an account',
  bonus_code: 'SC from a promo / bonus code (URL or deposit code)',
  daily_bonus: 'SC from the 7-day daily bonus calendar',
  daily_bonus_spin: 'Extra spin granted by the daily bonus',
  promotion: 'SC from a promotion offer',
  vip_bonus: 'SC reward from VIP levels',
  affiliate: 'SC from Refer & Earn (inviter / affiliate)',
  referral_friend_signup: 'SC when a referred friend signs up',
  spin_wheel: 'SC or prize from the spin wheel',
  package_extra: 'Extra SC above the package pay price (e.g. 25 SC for $19.99 → 5 SC bonus)'
};

module.exports = {
  PACKAGE_EXTRA_TYPE,
  REAL_BONUS_TX_TYPES,
  BONUS_TX_TYPES,
  BONUS_TYPE_LABELS,
  BONUS_TYPE_HINTS
};
