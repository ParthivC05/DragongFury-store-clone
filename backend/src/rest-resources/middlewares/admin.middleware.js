const db = require('../../db/models');
const { sendError } = require('../../helpers/response.helpers');
const {
  isAdminPanelRole,
  isMasterAdmin,
  isDistributorAdmin,
  isStoreAdmin,
  normalizeRoleKey
} = require('../../constants/roles');
const { getEffectiveStorePermissions, getEffectiveAdminPermissions, canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

async function adminMiddleware(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return sendError(res, 'Unauthorized', 401);
  try {
    const includeStoreRole = [{ model: db.StoreRole, as: 'StoreRole', required: false }];
    const includeAdminRole = db.AdminRole ? [{ model: db.AdminRole, as: 'AdminRole', required: false }] : [];
    const user = await db.User.findByPk(userId, {
      attributes: ['role', 'isAdmin', 'distributorCode', 'storeCode', 'storeRoleId', 'adminRoleId'],
      include: [...includeStoreRole, ...includeAdminRole]
    });
    if (!user) return sendError(res, 'Forbidden. Admin only.', 403);
    if (isAdminPanelRole(user.role)) {
      req.role = normalizeRoleKey(user.role);
      req.distributorCode = user.distributorCode || null;
      req.storeCode = user.storeCode || null;
      if (isMasterAdmin(user.role)) {
        req.adminRoleId = user.adminRoleId || null;
        req.adminPermissions = getEffectiveAdminPermissions(user) || {};
        if (user.adminRoleId && user.AdminRole) {
          req.adminRoleName = user.AdminRole.name || null;
        }
      }
      if (isStoreAdmin(user.role)) {
        req.storeRoleId = user.storeRoleId || null;
        req.permissions = getEffectiveStorePermissions(user) || {};
        if (user.storeRoleId && user.StoreRole) {
          req.storeRoleName = user.StoreRole.name || null;
          req.storeRoleSlug = user.StoreRole.slug != null ? String(user.StoreRole.slug).trim() : null;
          req.storeName = user.storeCode || null;
          // Staff cannot exceed the store owner's page access.
          if (user.distributorCode && user.storeCode) {
            try {
              const {
                getOwnerPagePermissions,
                validateStorePermissions
              } = require('../../services/store/storeOwnerPermissions.service');
              const { STORE_FEATURE_KEYS_LIST } = require('../../constants/permissions');
              const ownerPerms = await getOwnerPagePermissions(user.distributorCode, user.storeCode);
              const rolePerms = validateStorePermissions(user.StoreRole.permissions || {});
              const capped = {};
              STORE_FEATURE_KEYS_LIST.forEach((k) => {
                capped[k] = rolePerms[k] === true && ownerPerms[k] === true;
              });
              req.permissions = capped;
            } catch (_) {
              /* keep role permissions */
            }
          }
        } else if (!user.storeRoleId && user.distributorCode && user.storeCode) {
          // Platform-managed page permissions for primary store owner (reserved store role).
          try {
            const { getOwnerPagePermissions } = require('../../services/store/storeOwnerPermissions.service');
            req.permissions = await getOwnerPagePermissions(user.distributorCode, user.storeCode);
          } catch (_) {
            /* keep full permissions from getEffectiveStorePermissions */
          }
        }
      }
      return next();
    }
    if (user.isAdmin === true || user.isAdmin === 1) {
      req.role = user.role != null ? normalizeRoleKey(user.role) || String(user.role).trim() : null;
      req.distributorCode = user.distributorCode || null;
      req.storeCode = user.storeCode || null;
      return next();
    }
  } catch (_) {}
  return sendError(res, 'Forbidden. Admin only.', 403);
}

async function requireMasterAdmin(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return sendError(res, 'Unauthorized', 401);
  try {
    const user = await db.User.findByPk(userId, { attributes: ['role', 'distributorCode'] });
    if (!user || !isMasterAdmin(user.role)) return sendError(res, 'Forbidden. Master admin only.', 403);
    req.role = user.role;
    req.distributorCode = user.distributorCode || null;
    return next();
  } catch (_) {
    return sendError(res, 'Forbidden. Master admin only.', 403);
  }
}

async function requireDistributorAdmin(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return sendError(res, 'Unauthorized', 401);
  try {
    const user = await db.User.findByPk(userId, { attributes: ['role', 'distributorCode'] });
    if (!user || !isDistributorAdmin(user.role)) return sendError(res, 'Forbidden. Distributor admin only.', 403);
    if (!user.distributorCode) return sendError(res, 'Forbidden. Distributor admin must have a distributor code.', 403);
    req.role = user.role;
    req.distributorCode = user.distributorCode;
    return next();
  } catch (_) {
    return sendError(res, 'Forbidden. Distributor admin only.', 403);
  }
}

async function requireStoreAdmin(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return sendError(res, 'Unauthorized', 401);
  try {
    const user = await db.User.findByPk(userId, { attributes: ['role', 'distributorCode', 'storeCode'] });
    if (!user || !isStoreAdmin(user.role)) return sendError(res, 'Forbidden. Store admin only.', 403);
    req.role = user.role;
    req.distributorCode = user.distributorCode || null;
    req.storeCode = user.storeCode || null;
    return next();
  } catch (_) {
    return sendError(res, 'Forbidden. Store admin only.', 403);
  }
}

/** Master admin or store admin (store routes that master may act on with distributorCode+storeCode). */
async function requireMasterOrStoreAdmin(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return sendError(res, 'Unauthorized', 401);
  try {
    const user = await db.User.findByPk(userId, { attributes: ['role', 'distributorCode', 'storeCode'] });
    if (!user) return sendError(res, 'Forbidden. Master or store admin only.', 403);
    if (isMasterAdmin(user.role)) {
      req.role = user.role;
      req.distributorCode = user.distributorCode || null;
      req.storeCode = user.storeCode || null;
      return next();
    }
    if (isStoreAdmin(user.role)) {
      req.role = user.role;
      req.distributorCode = user.distributorCode || null;
      req.storeCode = user.storeCode || null;
      return next();
    }
    return sendError(res, 'Forbidden. Master or store admin only.', 403);
  } catch (_) {
    return sendError(res, 'Forbidden. Master or store admin only.', 403);
  }
}

/**
 * Map first path segment (admin API) to required admin permission key.
 * master_admin with admin_role_id must have the permission to access the route.
 */
const ADMIN_PATH_TO_PERMISSION = {
  dashboard: ADMIN_FEATURE_KEYS.DASHBOARD,
  analytics: ADMIN_FEATURE_KEYS.DASHBOARD,
  distributors: ADMIN_FEATURE_KEYS.DISTRIBUTORS,
  stores: ADMIN_FEATURE_KEYS.STORES,
  users: ADMIN_FEATURE_KEYS.USERS,
  reports: ADMIN_FEATURE_KEYS.REPORTS,
  games: ADMIN_FEATURE_KEYS.GAMES,
  'game-logs': ADMIN_FEATURE_KEYS.GAME_LOGS,
  'game-report': ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT,
  'game-manual-requests': ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS,
  subscriptions: ADMIN_FEATURE_KEYS.SUBSCRIPTIONS,
  'subscription-requests': ADMIN_FEATURE_KEYS.SUBSCRIPTION_REQUESTS,
  'payment-providers': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'lightning-wallet': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'direct-crypto-treasury': ADMIN_FEATURE_KEYS.USER_DEPOSITS,
  'wallet-limits': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'redeem-percentage': ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS,
  'transaction-fees': ADMIN_FEATURE_KEYS.TRANSACTION_FEES,
  'admin-roles': ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE,
  'admin-staff': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE,
  'store-staff': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE,
  'store-roles': ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE,
  help: ADMIN_FEATURE_KEYS.HELP_CONTENT,
  blog: ADMIN_FEATURE_KEYS.BLOG_POSTS,
  link2play: ADMIN_FEATURE_KEYS.LINK2PLAY,
  footer: ADMIN_FEATURE_KEYS.FOOTER_PAGES,
  'support-tickets': ADMIN_FEATURE_KEYS.SUPPORT_TICKETS,
  'chime-deposits': ADMIN_FEATURE_KEYS.CHIME_DEPOSITS,
  'chime-accounts': ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS,
  'chime-cashapp-withdrawals': ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS,
  'deposit-requests': ADMIN_FEATURE_KEYS.USER_DEPOSITS,
  bonus: ADMIN_FEATURE_KEYS.BONUS_CODES,
  'email-campaigns': ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS,
  'push-campaigns': ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS,
  'bonus-report': ADMIN_FEATURE_KEYS.BONUS_REPORT,
  'bonus-sc-usage': ADMIN_FEATURE_KEYS.BONUS_SC_USAGE,
  'payment-report': ADMIN_FEATURE_KEYS.PAYMENT_REPORT,
  'wallet-adjust-report': ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT,
  'wallet-sc-reconciliation': ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION,
  'daily-sc-report': ADMIN_FEATURE_KEYS.DAILY_SC_REPORT,
  'store-wallet-summary': ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY,
  'automation-usage': ADMIN_FEATURE_KEYS.AUTOMATION_USAGE,
  'welcome-signup-bonus': ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS,
  'referral-transactions': ADMIN_FEATURE_KEYS.AFFILIATE,
  'geo-ip-allowlist': ADMIN_FEATURE_KEYS.GEO_IP_ALLOWLIST,
  'fingerprint-signup-ip-allowlist': ADMIN_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST,
  'didit-kyc': ADMIN_FEATURE_KEYS.DIDIT_KYC,
  'kyc-report': ADMIN_FEATURE_KEYS.DIDIT_KYC,
  'phone-verification': ADMIN_FEATURE_KEYS.PHONE_VERIFICATION,
  'staff-shifts': ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE,
  'staff-attendance': ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE,
  'contact-lists': ADMIN_FEATURE_KEYS.CONTACT_LISTS
};

const ADMIN_PATH_SKIP = new Set(['me', 'auth']);

/**
 * Nested store routes that can be accessed with a more specific admin permission
 * instead of (or in addition to) the general STORES permission.
 */
function canAccessStoresNestedRoute(req, pathSegments) {
  if (pathSegments[0] !== 'stores') return null;

  // GET /stores — list only, so Landing payment links / Game Logs / Slots /
  // Geo IP allowlist pickers work without granting full Stores management.
  if (
    pathSegments.length === 1 &&
    String(req.method || '').toUpperCase() === 'GET' &&
    (canAdmin(req, ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.GAME_LOGS) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.FOOTER_PAGES) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.GAMES) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.GEO_IP_ALLOWLIST) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST))
  ) {
    return true;
  }

  // /stores/:id/landing-payment-links
  if (
    pathSegments.length >= 3 &&
    pathSegments[2] === 'landing-payment-links' &&
    canAdmin(req, ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS)
  ) {
    return true;
  }

  // /stores/:id/slot-providers
  if (
    pathSegments.length >= 3 &&
    pathSegments[2] === 'slot-providers' &&
    canAdmin(req, ADMIN_FEATURE_KEYS.GAMES)
  ) {
    return true;
  }

  return null;
}

/**
 * Enforce admin role permissions for master_admin with admin_role_id.
 * Store admin permission checks are done in each controller (e.g. can(req, STORE_FEATURE_KEYS.HELP_CONTENT)).
 */
function requireAdminPermissionByPath(req, res, next) {
  const pathSegments = (req.path || '').split('/').filter(Boolean);
  const first = pathSegments[0] || '';

  if (!isMasterAdmin(req.role)) return next();
  if (!req.adminRoleId) return next();
  if (ADMIN_PATH_SKIP.has(first)) return next();
  // PII lists must not fail-open when the role permission map is missing or empty.
  if (first === 'contact-lists') {
    if (!canAdmin(req, ADMIN_FEATURE_KEYS.CONTACT_LISTS)) {
      return sendError(res, 'You do not have permission to access this section.', 403);
    }
    return next();
  }
  if (!req.adminPermissions || typeof req.adminPermissions !== 'object' || Object.keys(req.adminPermissions).length === 0) {
    return next();
  }

  const nestedAllow = canAccessStoresNestedRoute(req, pathSegments);
  if (nestedAllow === true) return next();

  // Dashboard payment totals: deposit-requests summary + store-codes filter
  if (
    first === 'deposit-requests' &&
    canAdmin(req, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS)
  ) {
    return next();
  }

  const permissionKey = ADMIN_PATH_TO_PERMISSION[first];
  if (!permissionKey) return next();
  if (!canAdmin(req, permissionKey)) {
    return sendError(res, 'You do not have permission to access this section.', 403);
  }
  return next();
}

module.exports = {
  adminMiddleware,
  requireMasterAdmin,
  requireDistributorAdmin,
  requireStoreAdmin,
  requireMasterOrStoreAdmin,
  requireAdminPermissionByPath
};
