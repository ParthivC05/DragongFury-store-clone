import { ROLES, isTechnicalStaff } from './roles'
import { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS, canAccessFeature, canAccessAdminFeature } from './permissions'

/** In development only: master admin can access Games without the Games permission (legacy testing). */
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
const devRoutes = isDev ? [ROLES.MASTER_ADMIN] : []

export const DEFAULT_REDIRECT_PATH_FOR_STORE_ROLES = '/profile'

/** Sidebar nav items: path, label, allowedRoles, permissionKey for store_admin, adminPermissionKey for master_admin (with admin_role_id). */
export const NAV_ROUTES = [
  { path: '/', label: 'Dashboard', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DASHBOARD, adminPermissionKey: ADMIN_FEATURE_KEYS.DASHBOARD },
  { path: '/distributors', label: 'Distributors', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.DISTRIBUTORS },
  { path: '/stores', label: 'Stores', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.STORES },
  {
    path: '/team',
    label: 'Role and staff management',
    allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
    anyPermissionKeys: [STORE_FEATURE_KEYS.STORE_ROLES_MANAGE, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE],
    anyAdminPermissionKeys: [ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE]
  },
  { path: '/users', label: 'Users', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.USERS_LIST, adminPermissionKey: ADMIN_FEATURE_KEYS.USERS },
  { path: '/user-list', label: 'User directory', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.USERS },
  { path: '/contact-lists', label: 'Email & phone lists', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.CONTACT_LISTS },
  { path: '/reports', label: 'Reports', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.REPORTS, adminPermissionKey: ADMIN_FEATURE_KEYS.REPORTS },
  { path: '/bonus-report', label: 'Bonus report', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.BONUS_REPORT },
  { path: '/bonus-sc-usage', label: 'Bonus SC used & left', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.BONUS_SC_USAGE },
  { path: '/payment-report', label: 'Payment report', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.PAYMENT_REPORT },
  { path: '/wallet-adjust-report', label: 'Wallet adjust report', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT },
  { path: '/wallet-sc-reconciliation', label: 'SC coin story', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.WALLET_SC_RECONCILIATION, adminPermissionKey: ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION },
  { path: '/daily-sc-report', label: 'Daily SC report', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DAILY_SC_REPORT, adminPermissionKey: ADMIN_FEATURE_KEYS.DAILY_SC_REPORT },
  { path: '/staff-attendance', label: 'Staff attendance', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE },
  { path: '/games', label: 'Games', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.GAMES, adminPermissionKey: ADMIN_FEATURE_KEYS.GAMES },
  { path: '/slot-providers', label: 'Slot providers', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.GAMES },
  { path: '/game-logs', label: 'Game Logs', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.GAME_LOGS, adminPermissionKey: ADMIN_FEATURE_KEYS.GAME_LOGS },
  { path: '/slots-transactions', label: 'Slots Transactions', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.GAME_LOGS, adminPermissionKey: ADMIN_FEATURE_KEYS.GAME_LOGS },
  { path: '/casino-games-report', label: 'Casino games report', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.CASINO_GAMES_REPORT, adminPermissionKey: ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT },
  { path: '/game-manual-requests', label: 'Manual Requests', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS, adminPermissionKey: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS },
  { path: '/subscriptions', label: 'Subscriptions', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.SUBSCRIPTIONS },
  { path: '/subscription-requests', label: 'Subscription requests', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.SUBSCRIPTION_REQUESTS },
  { path: '/subscription', label: 'My subscription', allowedRoles: [ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.SUBSCRIPTION },
  { path: '/payment-providers', label: 'Payment methods', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.PAYMENT_PROVIDERS, adminPermissionKey: ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS },
  { path: '/lightning-wallet', label: 'Lightning wallet', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.PAYMENT_PROVIDERS, adminPermissionKey: ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS },
  { path: '/wallet-limits', label: 'Wallet limits', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.PAYMENT_PROVIDERS, adminPermissionKey: ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS },
  { path: '/transaction-fees', label: 'Transaction fees', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.TRANSACTION_FEES },
  { path: '/store-wallet-summary', label: 'Store wallet summary', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY },
  { path: '/deposits', label: 'User deposits', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.USER_DEPOSITS, adminPermissionKey: ADMIN_FEATURE_KEYS.USER_DEPOSITS },
  { path: '/direct-crypto-treasury', label: 'Direct Crypto treasury', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.USER_DEPOSITS, adminPermissionKey: ADMIN_FEATURE_KEYS.USER_DEPOSITS },
  { path: '/bonus', label: 'Bonus codes', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.BONUS_CODES, adminPermissionKey: ADMIN_FEATURE_KEYS.BONUS_CODES },
  { path: '/chime-cashapp-withdrawals', label: 'Chime withdrawals', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS, adminPermissionKey: ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS },
  { path: '/chime-deposits', label: 'Chime deposits', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.CHIME_DEPOSITS, adminPermissionKey: ADMIN_FEATURE_KEYS.CHIME_DEPOSITS },
  { path: '/chime-accounts', label: 'Chime accounts', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.CHIME_ACCOUNTS, adminPermissionKey: ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS },
  { path: '/profile', label: 'Profile', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN] },
  { path: '/help', label: 'Help content', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.HELP_CONTENT, adminPermissionKey: ADMIN_FEATURE_KEYS.HELP_CONTENT },
  { path: '/support-tickets', label: 'Support tickets', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.SUPPORT_TICKETS, adminPermissionKey: ADMIN_FEATURE_KEYS.SUPPORT_TICKETS },
  { path: '/social-links', label: 'Social media links', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.SOCIAL_LINKS, adminPermissionKey: ADMIN_FEATURE_KEYS.SOCIAL_LINKS },
  { path: '/landing-payment-links', label: 'Landing payment links', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.LANDING_PAYMENT_LINKS, adminPermissionKey: ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS },
  { path: '/blog', label: 'Blog posts', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.BLOG_POSTS, adminPermissionKey: ADMIN_FEATURE_KEYS.BLOG_POSTS },
  { path: '/link2play', label: 'Link2Play', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.LINK2PLAY, adminPermissionKey: ADMIN_FEATURE_KEYS.LINK2PLAY, excludeStoreCodes: ['casinoslots', 'grandsweeps', 'grandsweep'] },
  { path: '/footer', label: 'Footer links', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.FOOTER_PAGES, adminPermissionKey: ADMIN_FEATURE_KEYS.FOOTER_PAGES },
  { path: '/spin-wheel', label: 'Spin wheel', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.SPIN_WHEEL, adminPermissionKey: ADMIN_FEATURE_KEYS.SPIN_WHEEL },
  { path: '/vip', label: 'VIP', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.VIP, adminPermissionKey: ADMIN_FEATURE_KEYS.VIP },
  { path: '/affiliate', label: 'Refer & Earn', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.AFFILIATE, adminPermissionKey: ADMIN_FEATURE_KEYS.AFFILIATE },
  { path: '/referral-transactions', label: 'Referral report', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.AFFILIATE, adminPermissionKey: ADMIN_FEATURE_KEYS.AFFILIATE },
  { path: '/deposit-bonuses', label: 'Deposit bonuses', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DEPOSIT_BONUSES, adminPermissionKey: ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES },
  { path: '/welcome-signup-bonus', label: 'Welcome signup bonus', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.WELCOME_SIGNUP_BONUS, adminPermissionKey: ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS },
  { path: '/activate-bonus-modal', label: 'Activate bonus popup', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.WELCOME_SIGNUP_BONUS, adminPermissionKey: ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS },
  { path: '/dashboard-slideshow', label: 'Homepage pictures', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DASHBOARD_SLIDESHOW, adminPermissionKey: ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW },
  { path: '/dashboard-promo-modals', label: 'Login popups', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DASHBOARD_PROMO_MODALS, adminPermissionKey: ADMIN_FEATURE_KEYS.DASHBOARD_PROMO_MODALS },
  { path: '/daily-bonus', label: 'Daily bonus', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DAILY_BONUS, adminPermissionKey: ADMIN_FEATURE_KEYS.DAILY_BONUS },
  { path: '/email-campaigns', label: 'Email campaigns', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS, adminPermissionKey: ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS, storeCodes: ['playjuwa'] },
  { path: '/push-campaigns', label: 'Push notifications', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.PUSH_CAMPAIGNS, adminPermissionKey: ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS },
  { path: '/deposit-packages', label: 'Deposit packages', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.DEPOSIT_PACKAGES, adminPermissionKey: ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES },
  { path: '/automation-usage', label: 'Automation usage', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.AUTOMATION_USAGE },
  { path: '/geo-block', label: 'Geo blocking', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.GEO_BLOCK },
  { path: '/geo-ip-allowlist', label: 'Geo IP allowlist', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.GEO_IP_ALLOWLIST, adminPermissionKey: ADMIN_FEATURE_KEYS.GEO_IP_ALLOWLIST },
  { path: '/fingerprint-signup-ip-allowlist', label: 'Signup device IP allowlist', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST, adminPermissionKey: ADMIN_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST },
  { path: '/didit-kyc', label: 'KYC Config', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.DIDIT_KYC },
  { path: '/kyc-report', label: 'KYC report', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.DIDIT_KYC },
  { path: '/phone-verification', label: 'Phone verification', allowedRoles: [ROLES.MASTER_ADMIN], adminPermissionKey: ADMIN_FEATURE_KEYS.PHONE_VERIFICATION }
]

/** Route path (or pattern) -> allowed roles. Used for route-level access control. */
export const ROUTE_ACCESS = {
  '/': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  '': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'distributors': [ROLES.MASTER_ADMIN],
  'distributors/new': [ROLES.MASTER_ADMIN],
  'distributors/:id/edit': [ROLES.MASTER_ADMIN],
  'stores': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'stores/new': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'stores/:id': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'stores/:id/edit': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'team': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'admin-roles': [ROLES.MASTER_ADMIN],
  'admin-roles/new': [ROLES.MASTER_ADMIN],
  'admin-roles/:id/edit': [ROLES.MASTER_ADMIN],
  'admin-staff': [ROLES.MASTER_ADMIN],
  'admin-staff/new': [ROLES.MASTER_ADMIN],
  'admin-staff/:id/edit': [ROLES.MASTER_ADMIN],
  'store-roles': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'store-roles/new': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'store-roles/:id/edit': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'store-staff': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'store-staff/new': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'store-staff/:id/edit': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'users': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'users/:id': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'user-list': [ROLES.MASTER_ADMIN],
  'contact-lists': [ROLES.MASTER_ADMIN],
  'reports': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'bonus-report': [ROLES.MASTER_ADMIN],
  'bonus-sc-usage': [ROLES.MASTER_ADMIN],
  'payment-report': [ROLES.MASTER_ADMIN],
  'wallet-adjust-report': [ROLES.MASTER_ADMIN],
  'wallet-sc-reconciliation': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'daily-sc-report': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'staff-attendance': [ROLES.MASTER_ADMIN],
  'kyc-report': [ROLES.MASTER_ADMIN],
  'spin-wheel': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'vip': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'affiliate': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'referral-transactions': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'deposit-bonuses': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'welcome-signup-bonus': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'activate-bonus-modal': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'dashboard-slideshow': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'dashboard-promo-modals': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'daily-bonus': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'email-campaigns': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'push-campaigns': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'deposit-packages': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'games': [...devRoutes, ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'slot-providers': [ROLES.MASTER_ADMIN],
  'automation-usage': [ROLES.MASTER_ADMIN],
  'geo-block': [ROLES.MASTER_ADMIN],
  'geo-ip-allowlist': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'fingerprint-signup-ip-allowlist': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'didit-kyc': [ROLES.MASTER_ADMIN],
  'phone-verification': [ROLES.MASTER_ADMIN],
  'game-logs': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'slots-transactions': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'casino-games-report': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'game-report': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'game-manual-requests': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'subscriptions': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'subscriptions/new': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'subscriptions/:id/edit': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'subscription-requests': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN],
  'subscription': [ROLES.STORE_ADMIN],
  'payment-providers': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'lightning-wallet': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'wallet-limits': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'transaction-fees': [ROLES.MASTER_ADMIN],
  'store-wallet-summary': [ROLES.MASTER_ADMIN],
  'deposits': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'direct-crypto-treasury': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'bonus': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'chime-cashapp-withdrawals': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'chime-deposits': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'chime-accounts': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  'profile': [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN],
  's7k9n2': [ROLES.MASTER_ADMIN],
  'help': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'support-tickets': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'social-links': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'landing-payment-links': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'blog': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'blog/new': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'blog/:id/edit': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'link2play': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'link2play/new': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'link2play/:id/edit': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'footer': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'footer/pages/new': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'footer/pages/:id/edit': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],
  'footer/legal/:pageKey': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN]
}

/** Path segment -> permission key for store_admin permission check. */
export const PATH_PERMISSION = {
  '': STORE_FEATURE_KEYS.DASHBOARD,
  'reports': STORE_FEATURE_KEYS.REPORTS,
  'users': STORE_FEATURE_KEYS.USERS_LIST,
  'spin-wheel': STORE_FEATURE_KEYS.SPIN_WHEEL,
  'vip': STORE_FEATURE_KEYS.VIP,
  'affiliate': STORE_FEATURE_KEYS.AFFILIATE,
  'referral-transactions': STORE_FEATURE_KEYS.AFFILIATE,
  'deposit-bonuses': STORE_FEATURE_KEYS.DEPOSIT_BONUSES,
  'welcome-signup-bonus': STORE_FEATURE_KEYS.WELCOME_SIGNUP_BONUS,
  'activate-bonus-modal': STORE_FEATURE_KEYS.WELCOME_SIGNUP_BONUS,
  'dashboard-slideshow': STORE_FEATURE_KEYS.DASHBOARD_SLIDESHOW,
  'dashboard-promo-modals': STORE_FEATURE_KEYS.DASHBOARD_PROMO_MODALS,
  'daily-bonus': STORE_FEATURE_KEYS.DAILY_BONUS,
  'email-campaigns': STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS,
  'push-campaigns': STORE_FEATURE_KEYS.PUSH_CAMPAIGNS,
  'games': STORE_FEATURE_KEYS.GAMES,
  'game-logs': STORE_FEATURE_KEYS.GAME_LOGS,
  'slots-transactions': STORE_FEATURE_KEYS.GAME_LOGS,
  'casino-games-report': STORE_FEATURE_KEYS.CASINO_GAMES_REPORT,
  'game-report': STORE_FEATURE_KEYS.CASINO_GAMES_REPORT,
  'game-manual-requests': STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS,
  'store-roles': STORE_FEATURE_KEYS.STORE_ROLES_MANAGE,
  'store-staff': STORE_FEATURE_KEYS.STORE_STAFF_MANAGE,
  'subscription': STORE_FEATURE_KEYS.SUBSCRIPTION,
  'payment-providers': STORE_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'lightning-wallet': STORE_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'wallet-limits': STORE_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'deposits': STORE_FEATURE_KEYS.USER_DEPOSITS,
  'wallet-sc-reconciliation': STORE_FEATURE_KEYS.WALLET_SC_RECONCILIATION,
  'daily-sc-report': STORE_FEATURE_KEYS.DAILY_SC_REPORT,
  'direct-crypto-treasury': STORE_FEATURE_KEYS.USER_DEPOSITS,
  'bonus': STORE_FEATURE_KEYS.BONUS_CODES,
  'geo-ip-allowlist': STORE_FEATURE_KEYS.GEO_IP_ALLOWLIST,
  'fingerprint-signup-ip-allowlist': STORE_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST,
  'chime-cashapp-withdrawals': STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS,
  'chime-deposits': STORE_FEATURE_KEYS.CHIME_DEPOSITS,
  'chime-accounts': STORE_FEATURE_KEYS.CHIME_ACCOUNTS,
  'help': STORE_FEATURE_KEYS.HELP_CONTENT,
  'support-tickets': STORE_FEATURE_KEYS.SUPPORT_TICKETS,
  'social-links': STORE_FEATURE_KEYS.SOCIAL_LINKS,
  'landing-payment-links': STORE_FEATURE_KEYS.LANDING_PAYMENT_LINKS,
  'blog': STORE_FEATURE_KEYS.BLOG_POSTS,
  'link2play': STORE_FEATURE_KEYS.LINK2PLAY,
  'footer': STORE_FEATURE_KEYS.FOOTER_PAGES,
  'deposit-packages': STORE_FEATURE_KEYS.DEPOSIT_PACKAGES,
  'admin-staff': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE
}

/** Path segment -> any of these store permissions grants access. */
export const PATH_ANY_PERMISSION = {
  team: [STORE_FEATURE_KEYS.STORE_ROLES_MANAGE, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE]
}

/** Path segment -> admin permission key (for master_admin with admin_role_id). Used for route access and redirect. */
export const ADMIN_PATH_PERMISSION = {
  '': ADMIN_FEATURE_KEYS.DASHBOARD,
  'distributors': ADMIN_FEATURE_KEYS.DISTRIBUTORS,
  'stores': ADMIN_FEATURE_KEYS.STORES,
  'admin-roles': ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE,
  'admin-staff': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE,
  'store-staff': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE,
  'store-roles': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE,
  'users': ADMIN_FEATURE_KEYS.USERS,
  'user-list': ADMIN_FEATURE_KEYS.USERS,
  'contact-lists': ADMIN_FEATURE_KEYS.CONTACT_LISTS,
  'reports': ADMIN_FEATURE_KEYS.REPORTS,
  'bonus-report': ADMIN_FEATURE_KEYS.BONUS_REPORT,
  'bonus-sc-usage': ADMIN_FEATURE_KEYS.BONUS_SC_USAGE,
  'payment-report': ADMIN_FEATURE_KEYS.PAYMENT_REPORT,
  'wallet-adjust-report': ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT,
  'wallet-sc-reconciliation': ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION,
  'daily-sc-report': ADMIN_FEATURE_KEYS.DAILY_SC_REPORT,
  'staff-attendance': ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE,
  'kyc-report': ADMIN_FEATURE_KEYS.DIDIT_KYC,
  'games': ADMIN_FEATURE_KEYS.GAMES,
  'slot-providers': ADMIN_FEATURE_KEYS.GAMES,
  'automation-usage': ADMIN_FEATURE_KEYS.AUTOMATION_USAGE,
  'game-logs': ADMIN_FEATURE_KEYS.GAME_LOGS,
  'slots-transactions': ADMIN_FEATURE_KEYS.GAME_LOGS,
  'casino-games-report': ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT,
  'game-report': ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT,
  'game-manual-requests': ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS,
  'subscriptions': ADMIN_FEATURE_KEYS.SUBSCRIPTIONS,
  'subscription-requests': ADMIN_FEATURE_KEYS.SUBSCRIPTION_REQUESTS,
  'payment-providers': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'lightning-wallet': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'wallet-limits': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'transaction-fees': ADMIN_FEATURE_KEYS.TRANSACTION_FEES,
  'store-wallet-summary': ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY,
  'deposits': ADMIN_FEATURE_KEYS.USER_DEPOSITS,
  'direct-crypto-treasury': ADMIN_FEATURE_KEYS.USER_DEPOSITS,
  'bonus': ADMIN_FEATURE_KEYS.BONUS_CODES,
  'chime-cashapp-withdrawals': ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS,
  'chime-deposits': ADMIN_FEATURE_KEYS.CHIME_DEPOSITS,
  'chime-accounts': ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS,
  'help': ADMIN_FEATURE_KEYS.HELP_CONTENT,
  'support-tickets': ADMIN_FEATURE_KEYS.SUPPORT_TICKETS,
  'social-links': ADMIN_FEATURE_KEYS.SOCIAL_LINKS,
  'landing-payment-links': ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS,
  'blog': ADMIN_FEATURE_KEYS.BLOG_POSTS,
  'link2play': ADMIN_FEATURE_KEYS.LINK2PLAY,
  'footer': ADMIN_FEATURE_KEYS.FOOTER_PAGES,
  'spin-wheel': ADMIN_FEATURE_KEYS.SPIN_WHEEL,
  'vip': ADMIN_FEATURE_KEYS.VIP,
  'affiliate': ADMIN_FEATURE_KEYS.AFFILIATE,
  'referral-transactions': ADMIN_FEATURE_KEYS.AFFILIATE,
  'deposit-bonuses': ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES,
  'welcome-signup-bonus': ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS,
  'activate-bonus-modal': ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS,
  'dashboard-slideshow': ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW,
  'dashboard-promo-modals': ADMIN_FEATURE_KEYS.DASHBOARD_PROMO_MODALS,
  'daily-bonus': ADMIN_FEATURE_KEYS.DAILY_BONUS,
  'email-campaigns': ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS,
  'push-campaigns': ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS,
  'deposit-packages': ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES,
  'geo-block': ADMIN_FEATURE_KEYS.GEO_BLOCK,
  'geo-ip-allowlist': ADMIN_FEATURE_KEYS.GEO_IP_ALLOWLIST,
  'fingerprint-signup-ip-allowlist': ADMIN_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST,
  'didit-kyc': ADMIN_FEATURE_KEYS.DIDIT_KYC,
  'phone-verification': ADMIN_FEATURE_KEYS.PHONE_VERIFICATION
}

/** Path segment -> any of these admin permissions grants access. */
export const ADMIN_PATH_ANY_PERMISSION = {
  team: [ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE]
}

function hasAnyAdminPermission(user, keys) {
  return Array.isArray(keys) && keys.some((key) => canAccessAdminFeature(user, key))
}

function hasAnyStorePermission(user, keys) {
  return Array.isArray(keys) && keys.some((key) => canAccessFeature(user, key))
}

/**
 * Check if a role (and optionally user for permission check) can access a path.
 * Full Master Admin / Full Store Admin (no role assigned): always allow.
 * When assigned to a role (admin_role_id / store_role_id), allow only if that role has the required permission.
 */
export function canAccessPath(pathname, role, user = null) {
  if (!role) return false
  const segments = pathname.split('/').filter(Boolean)
  const pathKey = segments.join('/') || '/'
  const firstSegment = segments[0] || ''

  let roleAllowed = false
  if (ROUTE_ACCESS[pathKey] && ROUTE_ACCESS[pathKey].includes(role)) roleAllowed = true
  else if (ROUTE_ACCESS[pathname] && ROUTE_ACCESS[pathname].includes(role)) roleAllowed = true
  else {
    for (const [pattern, roles] of Object.entries(ROUTE_ACCESS)) {
      if (!roles.includes(role)) continue
      const patternSegments = pattern.split('/').filter(Boolean)
      if (patternSegments.length !== segments.length) continue
      const match = patternSegments.every((seg, i) => seg === segments[i] || seg.startsWith(':'))
      if (match) { roleAllowed = true; break }
    }
  }
  if (!roleAllowed) return false
  // Unlisted technical-staff page: not in sidebar; super admin and other roles are blocked.
  if (firstSegment === 's7k9n2') return isTechnicalStaff(user)
  if (user && role === ROLES.MASTER_ADMIN && ADMIN_PATH_ANY_PERMISSION[firstSegment]) {
    if (!hasAnyAdminPermission(user, ADMIN_PATH_ANY_PERMISSION[firstSegment])) return false
  } else if (user && role === ROLES.MASTER_ADMIN && ADMIN_PATH_PERMISSION[firstSegment]) {
    if (!canAccessAdminFeature(user, ADMIN_PATH_PERMISSION[firstSegment])) return false
  }
  if (user && role === ROLES.STORE_ADMIN && PATH_ANY_PERMISSION[firstSegment]) {
    if (!hasAnyStorePermission(user, PATH_ANY_PERMISSION[firstSegment])) return false
  } else if (user && role === ROLES.STORE_ADMIN && PATH_PERMISSION[firstSegment]) {
    if (!canAccessFeature(user, PATH_PERMISSION[firstSegment])) return false
  }
  // Store-scoped routes (e.g. allowlist / denylist by store code)
  if (user && role === ROLES.STORE_ADMIN) {
    const nav = NAV_ROUTES.find((r) => {
      const p = String(r.path || '').replace(/^\//, '')
      return p === firstSegment || p === pathKey
    })
    const sc = String(user.storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (Array.isArray(nav?.storeCodes) && nav.storeCodes.length > 0) {
      const allowed = nav.storeCodes.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      if (!allowed.includes(sc)) return false
    }
    if (Array.isArray(nav?.excludeStoreCodes) && nav.excludeStoreCodes.length > 0) {
      const blocked = nav.excludeStoreCodes.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      if (blocked.includes(sc)) return false
    }
  }
  return true
}

/** List of pages the user is allowed to access (path + label). Full admins (no role) see all; role-assigned staff only see routes their role allows. */
export function getAllowedPagesForUser(user) {
  if (!user?.role) return []
  return NAV_ROUTES.filter((route) => {
    if (!route.allowedRoles.includes(user.role)) return false
    if (user.role === ROLES.MASTER_ADMIN && Array.isArray(route.anyAdminPermissionKeys) && route.anyAdminPermissionKeys.length > 0) {
      return hasAnyAdminPermission(user, route.anyAdminPermissionKeys)
    }
    if (user.role === ROLES.STORE_ADMIN && Array.isArray(route.anyPermissionKeys) && route.anyPermissionKeys.length > 0) {
      return hasAnyStorePermission(user, route.anyPermissionKeys)
    }
    if (user.role === ROLES.MASTER_ADMIN && route.adminPermissionKey) return canAccessAdminFeature(user, route.adminPermissionKey)
    if (route.adminPermission && route.permissionKey) return canAccessAdminFeature(user, route.permissionKey)
    if (route.permissionKey && user.role === ROLES.STORE_ADMIN) {
      if (!canAccessFeature(user, route.permissionKey)) return false
    }
    if (user.role === ROLES.STORE_ADMIN && Array.isArray(route.storeCodes) && route.storeCodes.length > 0) {
      const sc = String(user.storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const allowed = route.storeCodes.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      if (!allowed.includes(sc)) return false
    }
    if (user.role === ROLES.STORE_ADMIN && Array.isArray(route.excludeStoreCodes) && route.excludeStoreCodes.length > 0) {
      const sc = String(user.storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const blocked = route.excludeStoreCodes.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      if (blocked.includes(sc)) return false
    }
    return true
  }).map((r) => ({ path: r.path, label: r.label }))
}

/** First path the user can access (for redirect when they hit a forbidden route). */
export function getFirstAllowedPathForUser(user) {
  const pages = getAllowedPagesForUser(user)
  return pages[0]?.path || DEFAULT_REDIRECT_PATH_FOR_STORE_ROLES
}
