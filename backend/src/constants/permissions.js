'use strict';

/**
 * Store-level feature keys for RBAC. Used in platform_roles and store_roles permissions JSONB.
 * Each key corresponds to a feature in the store admin panel; value true = allowed.
 */
const STORE_FEATURE_KEYS = {
  DASHBOARD: 'dashboard',
  USERS_LIST: 'users_list',
  /** Add / remove SC (and deduct RSC) on end-user wallets from User Detail. */
  WALLET_ADJUST: 'wallet_adjust',
  REPORTS: 'reports',
  SPIN_WHEEL: 'spin_wheel',
  VIP: 'vip',
  AFFILIATE: 'affiliate',
  GAMES: 'games',
  GAME_LOGS: 'game_logs',
  GAME_MANUAL_REQUESTS: 'game_manual_requests',
  GAME_MANUAL_REQUESTS_REGISTER: 'game_manual_requests_register',
  GAME_MANUAL_REQUESTS_DEPOSIT: 'game_manual_requests_deposit',
  GAME_MANUAL_REQUESTS_REDEEM: 'game_manual_requests_redeem',
  STORE_ROLES_MANAGE: 'store_roles_manage',
  STORE_STAFF_MANAGE: 'store_staff_manage',
  SUBSCRIPTION: 'subscription',
  PAYMENT_PROVIDERS: 'payment_providers',
  USER_DEPOSITS: 'user_deposits',
  /**
   * Dashboard payment totals (live deposit & withdrawal amounts for this store).
   * Full store admin has this by default. Store staff only if the role grants it.
   */
  PAYMENT_TOTALS: 'payment_totals',
  CHIME_CASHAPP_WITHDRAWALS: 'chime_cashapp_withdrawals',
  CHIME_DEPOSITS: 'chime_deposits',
  CHIME_ACCOUNTS: 'chime_accounts',
  /** Chime deposits Account totals tab. Off until super admin / technical staff grant it. */
  CHIME_DEPOSIT_ACCOUNT_TOTALS: 'chime_deposit_account_totals',
  HELP_CONTENT: 'help_content',
  BLOG_POSTS: 'blog_posts',
  /** PlayJuwa Link2Play landing catalog (name, image, platform links). */
  LINK2PLAY: 'link2play',
  /** Store footer menus and CMS pages (custom slugs). */
  FOOTER_PAGES: 'footer_pages',
  /** Player support tickets (conversation + attachments). */
  SUPPORT_TICKETS: 'support_tickets',
  BONUS_CODES: 'bonus_codes',
  DEPOSIT_BONUSES: 'deposit_bonuses',
  DEPOSIT_PACKAGES: 'deposit_packages',
  WELCOME_SIGNUP_BONUS: 'welcome_signup_bonus',
  DAILY_BONUS: 'daily_bonus',
  /** PlayJuwa no-deposit email campaigns (playjuwa store only). */
  EMAIL_CAMPAIGNS: 'email_campaigns',
  /** Browser push notifications (per store). */
  PUSH_CAMPAIGNS: 'push_campaigns',
  SOCIAL_LINKS: 'social_links',
  LANDING_PAYMENT_LINKS: 'landing_payment_links',
  DASHBOARD_PROMO_MODALS: 'dashboard_promo_modals',
  DASHBOARD_SLIDESHOW: 'dashboard_slideshow',
  /** Manage IPs that bypass geo-blocking for this store. */
  GEO_IP_ALLOWLIST: 'geo_ip_allowlist',
  /** Manage IPs that skip the one-account-per-device signup block. */
  FINGERPRINT_SIGNUP_IP_ALLOWLIST: 'fingerprint_signup_ip_allowlist',
  /** PSC / BSC / RSC coin story for this store. */
  WALLET_SC_RECONCILIATION: 'wallet_sc_reconciliation',
  /** Daily SC in / out / leftover report for this store. */
  DAILY_SC_REPORT: 'daily_sc_report',
  /**
   * Casino games report (SC wagered / won / GGR). Opt-in: off for store owner and staff
   * until super admin grants it.
   */
  CASINO_GAMES_REPORT: 'casino_games_report'
};

/** All store feature keys as array (for validation and UI listing). */
const STORE_FEATURE_KEYS_LIST = Object.values(STORE_FEATURE_KEYS);

/** Store pages that stay off until super admin grants them (not part of default full store access). */
const STORE_OPT_IN_FEATURE_KEYS = [
  STORE_FEATURE_KEYS.CASINO_GAMES_REPORT,
  STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS
];
const STORE_OPT_IN_FEATURE_KEY_SET = new Set(STORE_OPT_IN_FEATURE_KEYS);

/** Full store access: every key true except opt-in pages. Used for store_admin with no store_role_id. */
function fullStorePermissions() {
  const p = {};
  STORE_FEATURE_KEYS_LIST.forEach((k) => {
    p[k] = !STORE_OPT_IN_FEATURE_KEY_SET.has(k);
  });
  return p;
}

/**
 * Admin panel (master_admin) feature keys for RBAC. Used in admin_roles permissions JSONB.
 * master_admin with no admin_role_id has full access; with admin_role_id uses role permissions.
 */
const ADMIN_FEATURE_KEYS = {
  DASHBOARD: 'dashboard',
  DISTRIBUTORS: 'distributors',
  STORES: 'stores',
  USERS: 'users',
  /** Add / remove SC (and deduct RSC) on end-user wallets from User Detail. */
  WALLET_ADJUST: 'wallet_adjust',
  REPORTS: 'reports',
  GAMES: 'games',
  GAME_LOGS: 'game_logs',
  GAME_MANUAL_REQUESTS: 'game_manual_requests',
  GAME_MANUAL_REQUESTS_REGISTER: 'game_manual_requests_register',
  GAME_MANUAL_REQUESTS_DEPOSIT: 'game_manual_requests_deposit',
  GAME_MANUAL_REQUESTS_REDEEM: 'game_manual_requests_redeem',
  SUBSCRIPTIONS: 'subscriptions',
  SUBSCRIPTION_REQUESTS: 'subscription_requests',
  /** Store-style features in the admin UI (master_admin with admin_role_id). Same string values as STORE_FEATURE_KEYS where applicable. */
  SPIN_WHEEL: 'spin_wheel',
  VIP: 'vip',
  AFFILIATE: 'affiliate',
  PAYMENT_PROVIDERS: 'payment_providers',
  USER_DEPOSITS: 'user_deposits',
  CHIME_CASHAPP_WITHDRAWALS: 'chime_cashapp_withdrawals',
  CHIME_DEPOSITS: 'chime_deposits',
  CHIME_ACCOUNTS: 'chime_accounts',
  /** Chime deposits Account totals tab. Super admin; grant to technical staff. Never for store admins. */
  CHIME_DEPOSIT_ACCOUNT_TOTALS: 'chime_deposit_account_totals',
  ADMIN_ROLES_MANAGE: 'admin_roles_manage',
  ADMIN_STAFF_MANAGE: 'admin_staff_manage',
  HELP_CONTENT: 'help_content',
  /** Store-scoped blog posts. Scope via blog_posts_store_scope / blog_posts_store_codes on admin roles. */
  BLOG_POSTS: 'blog_posts',
  /** PlayJuwa Link2Play landing catalog. */
  LINK2PLAY: 'link2play',
  /** Store footer menus and CMS pages (custom slugs). Scope via footer_pages_store_scope / footer_pages_store_codes on admin roles. */
  FOOTER_PAGES: 'footer_pages',
  /** Player support tickets (conversation + attachments). */
  SUPPORT_TICKETS: 'support_tickets',
  TECHNICAL_ERROR_EMAIL_NOTIFICATION: 'technical_error_email_notification',
  BONUS_CODES: 'bonus_codes',
  /** PlayJuwa no-deposit email campaigns. */
  EMAIL_CAMPAIGNS: 'email_campaigns',
  /** PlayJuwa browser push campaigns. */
  PUSH_CAMPAIGNS: 'push_campaigns',
  /** Read-only bonus activity report across stores (technical staff). */
  BONUS_REPORT: 'bonus_report',
  /** Used vs unused Bonus SC (BSC) report — super admin + technical staff. */
  BONUS_SC_USAGE: 'bonus_sc_usage',
  /** Payment method & provider success/failure rates (super admin + technical staff). */
  PAYMENT_REPORT: 'payment_report',
  /** Admin/staff PSC/BSC/RSC add & remove audit report (super admin + technical staff). */
  WALLET_ADJUST_REPORT: 'wallet_adjust_report',
  /** Full PSC / Bonus / RSC coin story for every store and player (super admin + technical staff). */
  WALLET_SC_RECONCILIATION: 'wallet_sc_reconciliation',
  /** Daily SC in / out / leftover across stores (super admin + technical staff). */
  DAILY_SC_REPORT: 'daily_sc_report',
  /** Casino games report (SC wagered / won / GGR). Super admin + technical staff; grant to stores separately. */
  CASINO_GAMES_REPORT: 'casino_games_report',
  DEPOSIT_BONUSES: 'deposit_bonuses',
  DEPOSIT_PACKAGES: 'deposit_packages',
  WELCOME_SIGNUP_BONUS: 'welcome_signup_bonus',
  DAILY_BONUS: 'daily_bonus',
  /** Per-store wallet topup / withdraw totals (master admin panel; grant to technical staff roles as needed). */
  STORE_WALLET_SUMMARY: 'store_wallet_summary',
  /**
   * Dashboard / store payment totals (live deposit & withdrawal amounts).
   * Super admin and technical staff have this by default. Other admin roles need it granted.
   */
  PAYMENT_TOTALS: 'payment_totals',
  /** Third-party bot API usage and error reporting (super admin + technical staff). */
  AUTOMATION_USAGE: 'automation_usage',
  SOCIAL_LINKS: 'social_links',
  LANDING_PAYMENT_LINKS: 'landing_payment_links',
  DASHBOARD_PROMO_MODALS: 'dashboard_promo_modals',
  DASHBOARD_SLIDESHOW: 'dashboard_slideshow',
  /** Manage IPs that bypass geo-blocking on the user site. */
  GEO_IP_ALLOWLIST: 'geo_ip_allowlist',
  /** Turn geo blocking on or off per store. */
  GEO_BLOCK: 'geo_block',
  /** Manage IPs that skip the one-account-per-device signup block. */
  FINGERPRINT_SIGNUP_IP_ALLOWLIST: 'fingerprint_signup_ip_allowlist',
  /** Store staff shift allocation, check-in report, and off-shift login approval. */
  STAFF_ATTENDANCE: 'staff_attendance',
  /** Enable/disable Didit KYC required for withdrawals (credentials via env). */
  DIDIT_KYC: 'didit_kyc',
  /** Enable/disable Didit phone OTP verification per store (credentials via env). */
  PHONE_VERIFICATION: 'phone_verification',
  /** Per-store payin/payout fee % (super admin + technical staff). Admin reporting only. */
  TRANSACTION_FEES: 'transaction_fees',
  /** Super-admin email list + mobile number list with CSV download tracking. */
  CONTACT_LISTS: 'contact_lists'
};

/** All admin feature keys as array (for validation and UI listing). */
const ADMIN_FEATURE_KEYS_LIST = Object.values(ADMIN_FEATURE_KEYS);

/** Full admin access: every key true. Used for master_admin with no admin_role_id. */
function fullAdminPermissions() {
  const p = {};
  ADMIN_FEATURE_KEYS_LIST.forEach((k) => { p[k] = true; });
  return p;
}

module.exports = {
  STORE_FEATURE_KEYS,
  STORE_FEATURE_KEYS_LIST,
  STORE_OPT_IN_FEATURE_KEYS,
  fullStorePermissions,
  ADMIN_FEATURE_KEYS,
  ADMIN_FEATURE_KEYS_LIST,
  fullAdminPermissions
};
