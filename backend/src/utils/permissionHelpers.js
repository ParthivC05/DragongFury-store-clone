'use strict';

const {
  fullStorePermissions,
  fullAdminPermissions,
  STORE_FEATURE_KEYS,
  ADMIN_FEATURE_KEYS
} = require('../constants/permissions');
const { isMasterAdmin, isDistributorAdmin, isStoreAdmin } = require('../constants/roles');

/**
 * Resolve effective store permissions for a user row (with optional StoreRole included).
 * - master_admin / distributor_admin: not store-scoped; no store permissions (caller uses role checks).
 * - store_admin with no store_role_id: full store permissions.
 * - store_admin with store_role_id: storeRole.permissions only.
 * @param {object} user - User model instance with optional StoreRole
 * @returns {object|null} - Permissions object or null if not a store-level user
 */
function getEffectiveStorePermissions(user) {
  if (!user || !isStoreAdmin(user.role)) return null;
  if (!user.storeRoleId) return fullStorePermissions();
  const storeRole = user.StoreRole;
  if (!storeRole) return fullStorePermissions(); // fallback if association not loaded
  return storeRole.permissions || {};
}

/**
 * Resolve effective admin panel permissions for a user (with optional AdminRole included).
 * - master_admin with no admin_role_id: full admin permissions.
 * - master_admin with admin_role_id: adminRole.permissions only.
 * @param {object} user - User model instance with optional AdminRole
 * @returns {object|null} - Permissions object or null if not master_admin
 */
function getEffectiveAdminPermissions(user) {
  if (!user || !isMasterAdmin(user.role)) return null;
  if (!user.adminRoleId) return fullAdminPermissions();
  const adminRole = user.AdminRole;
  // Technical staff whose role cannot be loaded must not inherit super-admin access.
  if (!adminRole) return {};
  return adminRole.permissions || {};
}

/**
 * Check if the request has access to a store feature (for store_admin only).
 * master_admin and distributor_admin are not checked here; use role middleware for those.
 * @param {object} req - request with req.role, req.permissions (set by admin middleware for store_admin)
 * @param {string} featureKey - e.g. 'reports', 'spin_wheel'
 * @returns {boolean}
 */
function can(req, featureKey) {
  if (!req || !featureKey) return false;
  if (isMasterAdmin(req.role)) return true;
  if (isDistributorAdmin(req.role)) return true; // distributor has full access to their scope in admin
  if (isStoreAdmin(req.role)) {
    const perms = req.permissions;
    if (!perms) return false;
    if (featureKey === STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS) {
      return perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS] === true ||
        perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER] === true ||
        perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT] === true ||
        perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS) {
      return perms[STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_DEPOSITS) {
      return perms[STORE_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_ACCOUNTS) {
      return perms[STORE_FEATURE_KEYS.CHIME_ACCOUNTS] === true ||
        perms[STORE_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.USER_DEPOSITS) {
      return perms[STORE_FEATURE_KEYS.USER_DEPOSITS] === true ||
        perms[STORE_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.PAYMENT_TOTALS) {
      return perms[STORE_FEATURE_KEYS.PAYMENT_TOTALS] === true;
    }
    // Legacy: before wallet_adjust existed, Users access included add/remove SC
    if (featureKey === STORE_FEATURE_KEYS.WALLET_ADJUST) {
      if (Object.prototype.hasOwnProperty.call(perms, STORE_FEATURE_KEYS.WALLET_ADJUST)) {
        return perms[STORE_FEATURE_KEYS.WALLET_ADJUST] === true;
      }
      return perms[STORE_FEATURE_KEYS.USERS_LIST] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.CASINO_GAMES_REPORT) {
      return perms[STORE_FEATURE_KEYS.CASINO_GAMES_REPORT] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS) {
      return perms[STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS] === true;
    }
    if (featureKey === STORE_FEATURE_KEYS.DAILY_SC_REPORT) {
      return perms[STORE_FEATURE_KEYS.DAILY_SC_REPORT] === true ||
        perms[STORE_FEATURE_KEYS.WALLET_SC_RECONCILIATION] === true ||
        perms[STORE_FEATURE_KEYS.REPORTS] === true;
    }
    return perms[featureKey] === true;
  }
  return false;
}

/**
 * Check if the request has access to an admin panel feature (for master_admin only).
 * master_admin with no admin_role_id has full access; with admin_role_id uses req.adminPermissions.
 * @param {object} req - request with req.role, req.adminPermissions (set by admin middleware for master_admin)
 * @param {string} featureKey - e.g. 'admin_roles_manage', 'technical_error_email_notification'
 * @returns {boolean}
 */
function canAdmin(req, featureKey) {
  if (!req || !featureKey) return false;
  if (!isMasterAdmin(req.role)) return false;
  // Email & phone lists never inherit and never fail-open for technical staff.
  if (featureKey === ADMIN_FEATURE_KEYS.CONTACT_LISTS) {
    if (!req.adminRoleId) return true;
    return req.adminPermissions != null && req.adminPermissions[ADMIN_FEATURE_KEYS.CONTACT_LISTS] === true;
  }
  const perms = req.adminPermissions;
  if (!perms) return true; // full access when not set
  if (featureKey === ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS) {
    return perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS) {
    return perms[ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_DEPOSITS) {
    return perms[ADMIN_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS) {
    return perms[ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS] === true ||
      perms[ADMIN_FEATURE_KEYS.CHIME_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.USER_DEPOSITS) {
    return perms[ADMIN_FEATURE_KEYS.USER_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY) {
    return perms[ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true ||
      perms[ADMIN_FEATURE_KEYS.GAMES] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.PAYMENT_TOTALS) {
    if (!req.adminRoleId) return true;
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS)) {
      return perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === true;
    }
    return true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.TRANSACTION_FEES) {
    return perms[ADMIN_FEATURE_KEYS.TRANSACTION_FEES] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true ||
      perms[ADMIN_FEATURE_KEYS.USER_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.AUTOMATION_USAGE) {
    return perms[ADMIN_FEATURE_KEYS.AUTOMATION_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.GAMES] === true;
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
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true;
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
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.PAYMENT_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.PAYMENT_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true ||
      perms[ADMIN_FEATURE_KEYS.USER_DEPOSITS] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST] === true ||
      perms[ADMIN_FEATURE_KEYS.USERS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION) {
    return perms[ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_SC_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DAILY_SC_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.DAILY_SC_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true ||
      perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_SC_USAGE] === true ||
      perms[ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT) {
    return perms[ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT] === true ||
      perms[ADMIN_FEATURE_KEYS.GAME_LOGS] === true ||
      perms[ADMIN_FEATURE_KEYS.REPORTS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES) {
    return perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES) {
    return perms[ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS) {
    return perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true ||
      perms[ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES] === true ||
      perms[ADMIN_FEATURE_KEYS.BONUS_CODES] === true ||
      perms[ADMIN_FEATURE_KEYS.AFFILIATE] === true ||
      perms[ADMIN_FEATURE_KEYS.SPIN_WHEEL] === true ||
      perms[ADMIN_FEATURE_KEYS.VIP] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW) {
    return perms[ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true ||
      perms[ADMIN_FEATURE_KEYS.SOCIAL_LINKS] === true ||
      perms[ADMIN_FEATURE_KEYS.HELP_CONTENT] === true ||
      perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] === true ||
      perms[ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS] === true ||
      perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS) {
    return perms[ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS] === true ||
      perms[ADMIN_FEATURE_KEYS.STORES] === true;
  }
  // Footer pages: if key was never set, inherit from help/blog; otherwise honour explicit value
  if (featureKey === ADMIN_FEATURE_KEYS.FOOTER_PAGES) {
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.FOOTER_PAGES)) {
      return perms[ADMIN_FEATURE_KEYS.FOOTER_PAGES] === true;
    }
    return perms[ADMIN_FEATURE_KEYS.HELP_CONTENT] === true ||
      perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] === true;
  }
  if (featureKey === ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE) {
    return perms[ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE] === true ||
      perms[ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE] === true;
  }
  // Legacy: before wallet_adjust existed, Users access included add/remove SC
  if (featureKey === ADMIN_FEATURE_KEYS.WALLET_ADJUST) {
    if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.WALLET_ADJUST)) {
      return perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST] === true;
    }
    return perms[ADMIN_FEATURE_KEYS.USERS] === true;
  }
  return perms[featureKey] === true;
}

module.exports = {
  getEffectiveStorePermissions,
  getEffectiveAdminPermissions,
  can,
  canAdmin
};
