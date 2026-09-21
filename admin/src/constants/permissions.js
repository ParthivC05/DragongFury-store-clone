/**
 * Store-level feature keys. Must match backend src/constants/permissions.js STORE_FEATURE_KEYS.
 * Used for permission-based nav and route access when user has user.permissions (store_admin with store_role_id).
 */
export const STORE_FEATURE_KEYS = {
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
  /** Dashboard payment totals (live deposit & withdrawal amounts for this store). */
  PAYMENT_TOTALS: 'payment_totals',
  CHIME_CASHAPP_WITHDRAWALS: 'chime_cashapp_withdrawals',
  CHIME_DEPOSITS: 'chime_deposits',
  CHIME_ACCOUNTS: 'chime_accounts',
  /** Chime deposits Account totals tab. Off until super admin / technical staff grant it. */
  CHIME_DEPOSIT_ACCOUNT_TOTALS: 'chime_deposit_account_totals',
  HELP_CONTENT: 'help_content',
  BLOG_POSTS: 'blog_posts',
  /** PlayJuwa Link2Play landing catalog. */
  LINK2PLAY: 'link2play',
  FOOTER_PAGES: 'footer_pages',
  SUPPORT_TICKETS: 'support_tickets',
  BONUS_CODES: 'bonus_codes',
  DEPOSIT_BONUSES: 'deposit_bonuses',
  DEPOSIT_PACKAGES: 'deposit_packages',
  WELCOME_SIGNUP_BONUS: 'welcome_signup_bonus',
  DAILY_BONUS: 'daily_bonus',
  /** PlayJuwa no-deposit email campaigns. */
  EMAIL_CAMPAIGNS: 'email_campaigns',
  /** PlayJuwa browser push campaigns. */
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
  /** Casino games report. Off until super admin grants it. */
  CASINO_GAMES_REPORT: 'casino_games_report'
}

/**
 * Admin panel (master_admin) feature keys. Must match backend ADMIN_FEATURE_KEYS.
 * Used when user.role === 'master_admin' and user.adminPermissions (from admin_role_id).
 */
export const ADMIN_FEATURE_KEYS = {
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
  /** Store-scoped blog posts. Admin roles may also set blog_posts_store_scope / blog_posts_store_codes. */
  BLOG_POSTS: 'blog_posts',
  /** PlayJuwa Link2Play landing catalog. */
  LINK2PLAY: 'link2play',
  FOOTER_PAGES: 'footer_pages',
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
  /** Daily SC in / out / leftover across stores. */
  DAILY_SC_REPORT: 'daily_sc_report',
  /** Casino games report. Super admin + technical staff; grant to stores separately. */
  CASINO_GAMES_REPORT: 'casino_games_report',
  DEPOSIT_BONUSES: 'deposit_bonuses',
  DEPOSIT_PACKAGES: 'deposit_packages',
  WELCOME_SIGNUP_BONUS: 'welcome_signup_bonus',
  DAILY_BONUS: 'daily_bonus',
  STORE_WALLET_SUMMARY: 'store_wallet_summary',
  /** Dashboard / store payment totals (live deposit & withdrawal amounts). */
  PAYMENT_TOTALS: 'payment_totals',
  AUTOMATION_USAGE: 'automation_usage',
  SOCIAL_LINKS: 'social_links',
  LANDING_PAYMENT_LINKS: 'landing_payment_links',
  DASHBOARD_PROMO_MODALS: 'dashboard_promo_modals',
  DASHBOARD_SLIDESHOW: 'dashboard_slideshow',
  /** Manage IPs that bypass geo-blocking on the user site. */
  GEO_IP_ALLOWLIST: 'geo_ip_allowlist',
  /** Manage IPs that skip the one-account-per-device signup block. */
  FINGERPRINT_SIGNUP_IP_ALLOWLIST: 'fingerprint_signup_ip_allowlist',
  /** Store staff shift report and off-shift login approval. */
  STAFF_ATTENDANCE: 'staff_attendance',
  /** Enable/disable Didit KYC required for withdrawals. */
  DIDIT_KYC: 'didit_kyc',
  /** Enable/disable Didit phone OTP verification per store. */
  PHONE_VERIFICATION: 'phone_verification',
  /** Per-store payin/payout fee % (super admin + technical staff). */
  TRANSACTION_FEES: 'transaction_fees',
  /** Super-admin email list + mobile number list with CSV download tracking. */
  CONTACT_LISTS: 'contact_lists'
}

/** Store-only permissions for store_admin nav. Master/technical staff manage these via Role and staff management (admin_staff_manage). */
const STORE_ONLY_PERMISSION_KEYS = [STORE_FEATURE_KEYS.STORE_ROLES_MANAGE, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE]

/**
 * Check if user can access a feature.
 * Full Store Admin (no store_role_id): always allow. When assigned to a role (store_role_id), allow only if role has the permission.
 * Master admin with admin_staff_manage can access store roles/staff management features.
 */
export function canAccessFeature(user, featureKey) {
  if (!user) return false
  if (STORE_ONLY_PERMISSION_KEYS.includes(featureKey)) {
    if (user.role === 'master_admin') {
      return canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)
    }
    if (user.role !== 'store_admin') return false
    if (user.permissions && typeof user.permissions === 'object' && Object.keys(user.permissions).length > 0) {
      return user.permissions[featureKey] === true
    }
    if (!user.storeRoleId) return true // full store admin
    if (user.permissions && typeof user.permissions === 'object') return user.permissions[featureKey] === true
    return true
  }
  if (user.role === 'master_admin' || user.role === 'distributor_admin') return true
  if (user.role === 'store_admin') {
    const hasPerms = user.permissions && typeof user.permissions === 'object' && Object.keys(user.permissions).length > 0
    // Honour permissions for staff and for primary owners restricted from Edit Store.
    // No permission map → full access (legacy primary owner).
    if (!hasPerms) {
      return featureKey !== STORE_FEATURE_KEYS.CASINO_GAMES_REPORT
        && featureKey !== STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS
    }
    if (featureKey === STORE_FEATURE_KEYS.CASINO_GAMES_REPORT) {
      return user.permissions[featureKey] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS) {
      return user.permissions[featureKey] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.DAILY_SC_REPORT) {
      const perms = user.permissions || {}
      return perms[STORE_FEATURE_KEYS.DAILY_SC_REPORT] === true ||
        perms[STORE_FEATURE_KEYS.WALLET_SC_RECONCILIATION] === true ||
        perms[STORE_FEATURE_KEYS.REPORTS] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS) {
      const perms = user.permissions || {}
      return perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS] === true ||
        perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER] === true ||
        perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT] === true ||
        perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS) {
      const perms = user.permissions || {}
      return perms[STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_DEPOSITS) {
      const perms = user.permissions || {}
      return perms[STORE_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_ACCOUNTS) {
      const perms = user.permissions || {}
      return perms[STORE_FEATURE_KEYS.CHIME_ACCOUNTS] === true ||
        perms[STORE_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.USER_DEPOSITS) {
      const perms = user.permissions || {}
      return perms[STORE_FEATURE_KEYS.USER_DEPOSITS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
    }
    if (featureKey === STORE_FEATURE_KEYS.PAYMENT_TOTALS) {
      return user.permissions[STORE_FEATURE_KEYS.PAYMENT_TOTALS] === true
    }
    // Legacy: before wallet_adjust existed, Users access included add/remove SC
    if (featureKey === STORE_FEATURE_KEYS.WALLET_ADJUST) {
      const perms = user.permissions || {}
      if (Object.prototype.hasOwnProperty.call(perms, STORE_FEATURE_KEYS.WALLET_ADJUST)) {
        return perms[STORE_FEATURE_KEYS.WALLET_ADJUST] === true
      }
      return perms[STORE_FEATURE_KEYS.USERS_LIST] === true
    }
    // Footer pages: roles that already manage help/blog can access until explicitly set
    if (featureKey === STORE_FEATURE_KEYS.FOOTER_PAGES) {
      const perms = user.permissions || {}
      if (Object.prototype.hasOwnProperty.call(perms, STORE_FEATURE_KEYS.FOOTER_PAGES)) {
        return perms[STORE_FEATURE_KEYS.FOOTER_PAGES] === true
      }
      return perms[STORE_FEATURE_KEYS.HELP_CONTENT] === true ||
        perms[STORE_FEATURE_KEYS.BLOG_POSTS] === true
    }
    return user.permissions[featureKey] === true
  }
  return false
}

/**
 * Check if master_admin can access an admin panel feature.
 * Full Master Admin (no admin_role_id): always allow. When assigned to a role (admin_role_id), allow only if role has the permission.
 */
export function canAccessAdminFeature(user, featureKey) {
  if (!user || user.role !== 'master_admin') return false
  if (!user.adminRoleId) return true // full master admin: no role assigned → full access
  const perms = user.adminPermissions
  // Email & phone lists never inherit and never fail-open for technical staff.
  if (featureKey === ADMIN_FEATURE_KEYS.CONTACT_LISTS) {
    return Boolean(perms) && typeof perms === 'object' && perms[ADMIN_FEATURE_KEYS.CONTACT_LISTS] === true
  }
  // Account totals is on by default for technical staff; store/distributor never get it.
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS) {
    if (!perms || typeof perms !== 'object') return true
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS)) {
      return perms[ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS] === true
    }
    return true
  }
  // Payment totals: super admin + technical staff by default; honour explicit role flag.
  if (featureKey === ADMIN_FEATURE_KEYS.PAYMENT_TOTALS) {
    if (!perms || typeof perms !== 'object') return true
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS)) {
      return perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === true
    }
    return true
  }
  if (!perms || typeof perms !== 'object') return true
  if (featureKey === ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS) {
    return perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS) {
    return perms[ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_DEPOSITS) {
    return perms[ADMIN_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS) {
    return perms[ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS] === true ||
      perms[ADMIN_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.USER_DEPOSITS) {
    return perms[ADMIN_FEATURE_KEYS.USER_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY) {
    return perms[ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true ||
      perms[ADMIN_FEATURE_KEYS.GAMES] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.TRANSACTION_FEES) {
    return perms[ADMIN_FEATURE_KEYS.TRANSACTION_FEES] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true ||
      perms[ADMIN_FEATURE_KEYS.USER_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.AUTOMATION_USAGE) {
    return perms[ADMIN_FEATURE_KEYS.AUTOMATION_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.GAMES] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.BONUS_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.BONUS_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DAILY_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.BONUS_SC_USAGE) {
    return perms[ADMIN_FEATURE_KEYS.BONUS_SC_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DAILY_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.PAYMENT_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.PAYMENT_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true ||
      perms[ADMIN_FEATURE_KEYS.USER_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST] === true ||
      perms[ADMIN_FEATURE_KEYS.USERS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION) {
    return perms[ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_SC_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DAILY_SC_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.DAILY_SC_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_SC_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_LOGS] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES) {
    return perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES) {
    return perms[ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS) {
    return perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW) {
    return perms[ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true ||
      perms[ADMIN_FEATURE_KEYS.SOCIAL_LINKS] === true ||
      perms[ADMIN_FEATURE_KEYS.HELP_CONTENT] === true ||
      perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] === true ||
      perms[ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS] === true ||
      perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DASHBOARD_PROMO_MODALS) {
    return perms[ADMIN_FEATURE_KEYS.DASHBOARD_PROMO_MODALS] === true ||
      perms[ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DAILY_BONUS) {
    return perms[ADMIN_FEATURE_KEYS.DAILY_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS) {
    return perms[ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true
  }
  // Footer pages: roles that already manage help/blog content can access until explicitly set
  if (featureKey === ADMIN_FEATURE_KEYS.FOOTER_PAGES) {
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.FOOTER_PAGES)) {
      return perms[ADMIN_FEATURE_KEYS.FOOTER_PAGES] === true
    }
    return perms[ADMIN_FEATURE_KEYS.HELP_CONTENT] === true ||
      perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] === true
  }
  if (featureKey === ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE) {
    return perms[ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE] === true ||
      perms[ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE] === true
  }
  // Legacy: before wallet_adjust existed, Users access included add/remove SC
  if (featureKey === ADMIN_FEATURE_KEYS.WALLET_ADJUST) {
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.WALLET_ADJUST)) {
      return perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST] === true
    }
    return perms[ADMIN_FEATURE_KEYS.USERS] === true
  }
  return perms[featureKey] === true
}

/**
 * Limit a store-code list by an admin role's All stores / One store scope
 * (e.g. blog_posts or footer_pages).
 */
export function filterStoreCodesByAdminScope(codes, adminPermissions, featureKey) {
  const list = [...new Set((Array.isArray(codes) ? codes : []).filter(Boolean).map((c) => String(c)))]
  const scope = adminPermissions?.[`${featureKey}_store_scope`]
  const limited = adminPermissions?.[`${featureKey}_store_codes`]
  if (scope === 'particular' && Array.isArray(limited) && limited.length > 0) {
    const allow = new Set(limited.map((c) => String(c).toLowerCase()))
    return list.filter((c) => allow.has(String(c).toLowerCase()))
  }
  return list
}
