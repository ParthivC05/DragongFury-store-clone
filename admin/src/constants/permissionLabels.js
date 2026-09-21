import { STORE_FEATURE_KEYS } from './permissions'

/** Only these features are shown in role permission UI (Dashboard, Users, Reports, Games, Recharge, Redeem, Spinwheel, VIP, Affiliate, Bonus, Limits, Subscription). */
export const ROLE_UI_FEATURE_KEYS = [
  STORE_FEATURE_KEYS.DASHBOARD,
  STORE_FEATURE_KEYS.USERS_LIST,
  STORE_FEATURE_KEYS.REPORTS,
  STORE_FEATURE_KEYS.GAMES,
  STORE_FEATURE_KEYS.RECHARGE,
  STORE_FEATURE_KEYS.REDEEM,
  STORE_FEATURE_KEYS.SPIN_WHEEL,
  STORE_FEATURE_KEYS.VIP,
  STORE_FEATURE_KEYS.AFFILIATE,
  STORE_FEATURE_KEYS.BONUS,
  STORE_FEATURE_KEYS.LIMITS,
  STORE_FEATURE_KEYS.SUBSCRIPTION
]

/** Human-readable labels for permission keys (for role edit UI). */
export const PERMISSION_LABELS = {
  [STORE_FEATURE_KEYS.DASHBOARD]: 'Dashboard',
  [STORE_FEATURE_KEYS.USERS_LIST]: 'Users',
  [STORE_FEATURE_KEYS.REPORTS]: 'Reports',
  [STORE_FEATURE_KEYS.TRANSACTIONS]: 'Transactions',
  [STORE_FEATURE_KEYS.RECHARGE]: 'Recharge / Deposit',
  [STORE_FEATURE_KEYS.REDEEM]: 'Redeem / Withdraw',
  [STORE_FEATURE_KEYS.WITHDRAW]: 'Withdraw',
  [STORE_FEATURE_KEYS.SPIN_WHEEL]: 'Spin wheel',
  [STORE_FEATURE_KEYS.VIP]: 'VIP',
  [STORE_FEATURE_KEYS.AFFILIATE]: 'Affiliate',
  [STORE_FEATURE_KEYS.GAMES]: 'Games',
  [STORE_FEATURE_KEYS.BONUS]: 'Bonus / Promotions',
  [STORE_FEATURE_KEYS.LIMITS]: 'Limits (min/max withdraw & topup)',
  [STORE_FEATURE_KEYS.SUBSCRIPTION]: 'Subscription',
  [STORE_FEATURE_KEYS.WITHDRAW_MANUAL]: 'Withdraw manual',
  [STORE_FEATURE_KEYS.WITHDRAW_AUTO]: 'Withdraw auto',
  [STORE_FEATURE_KEYS.BOT_FEATURES]: 'BOT features',
  [STORE_FEATURE_KEYS.PROFILE]: 'Profile',
  [STORE_FEATURE_KEYS.STORE_ROLES_MANAGE]: 'Manage store roles & staff',
  [STORE_FEATURE_KEYS.HELP_CONTENT]: 'Help content',
  [STORE_FEATURE_KEYS.SUPPORT_TICKETS]: 'Support tickets'
}

/** Order of permission keys shown in role UI (only the 12 features). */
export const PERMISSION_KEYS_ORDER = ROLE_UI_FEATURE_KEYS
