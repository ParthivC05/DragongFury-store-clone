const walletService = require('../../services/wallet');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');

function toPositiveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

/** Hard ceiling for configured money limits (prevents absurd / overflow values). */
const MAX_MONEY_LIMIT = 1000000;

function clampMoneyLimit(value, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return allowZero ? 0 : null;
  if (n < 0) return allowZero ? 0 : null;
  return Math.min(n, MAX_MONEY_LIMIT);
}

async function assertStoreScopeExists(scope) {
  if (!scope?.storeCode) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const { ROLES } = require('../../constants/roles');
  const where = {
    role: ROLES.STORE_ADMIN,
    storeRoleId: null,
    storeCode: String(scope.storeCode).trim()
  };
  if (scope.distributorCode != null && String(scope.distributorCode).trim()) {
    where.distributorCode = String(scope.distributorCode).trim();
  }
  const stores = await require('../../db/models').User.findAll({
    where,
    attributes: ['userId', 'distributorCode', 'storeCode'],
    raw: true,
    limit: 5
  });
  if (!stores.length) {
    const err = new Error('Store not found. Use a valid store code.');
    err.statusCode = 404;
    throw err;
  }
  if (stores.length > 1 && !(scope.distributorCode != null && String(scope.distributorCode).trim())) {
    const err = new Error('Multiple stores match this storeCode. Provide distributorCode as well.');
    err.statusCode = 400;
    throw err;
  }
  const store = stores[0];
  return {
    distributorCode: store.distributorCode ?? null,
    storeCode: store.storeCode
  };
}

function getSettingsScope(req) {
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  return null;
}

function canAccessWalletLimits(req) {
  if (isMasterAdmin(req.role)) return true;
  if (isStoreAdmin(req.role)) {
    return can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS) || can(req, STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS);
  }
  return false;
}

function parseStoreScopeFromBody(body) {
  const distributorCode =
    body?.distributorCode != null && String(body.distributorCode).trim()
      ? String(body.distributorCode).trim()
      : null;
  const storeCode =
    body?.storeCode != null && String(body.storeCode).trim()
      ? String(body.storeCode).trim()
      : null;
  if (!distributorCode && !storeCode) return null;
  return { distributorCode, storeCode };
}

async function getWalletLimits(req, res) {
  try {
    if (!canAccessWalletLimits(req)) {
      return sendError(res, 'You do not have permission to view wallet limits.', 403);
    }

    // Master/tech staff can inspect a specific store via query params
    let scope = getSettingsScope(req);
    if (isMasterAdmin(req.role)) {
      const qDist = req.query?.distributorCode != null ? String(req.query.distributorCode).trim() : '';
      const qStore = req.query?.storeCode != null ? String(req.query.storeCode).trim() : '';
      if (qDist || qStore) {
        scope = {
          distributorCode: qDist || null,
          storeCode: qStore || null
        };
      } else {
        scope = null;
      }
    }

    const limits = await walletService.getWalletLimitsForScope(scope);
    return sendSuccess(res, {
      ...limits,
      canEditDepositWithdrawLimits: true,
      canEditDailyWithdrawMax: true,
      canManageStoreDailyLimits: isMasterAdmin(req.role),
      scope: scope
        ? { distributorCode: scope.distributorCode, storeCode: scope.storeCode }
        : null
    });
  } catch (err) {
    return sendError(res, err.message || 'Unable to load wallet limits.', err.statusCode || 500);
  }
}

async function updateWalletLimits(req, res) {
  try {
    if (!canAccessWalletLimits(req)) {
      return sendError(res, 'You do not have permission to update wallet limits.', 403);
    }

    const updatedBy = req.user?.username || null;

    // Store admin: full wallet limits for their own store (deposit/withdraw + daily)
    if (isStoreAdmin(req.role) && !isMasterAdmin(req.role)) {
      const scope = getSettingsScope(req);
      if (!scope) {
        return sendError(res, 'Store context is required to set wallet limits.', 400);
      }

      // Clear only the store daily override → inherit platform daily default
      if (req.body?.usePlatformDefault === true || req.body?.clearOverride === true) {
        const amountPayload = {};
        // depositMin/depositMax are platform-wide only — do not write them on store rows.
        if (req.body?.withdrawMin !== undefined) {
          amountPayload.withdrawMin = Math.min(MAX_MONEY_LIMIT, toNonNegativeNumber(req.body.withdrawMin, 10));
        }
        if (req.body?.withdrawMax !== undefined) {
          amountPayload.withdrawMax = Math.min(MAX_MONEY_LIMIT, toPositiveNumber(req.body.withdrawMax, 50));
        }
        if (Object.keys(amountPayload).length > 0) {
          await walletService.updateStoreWalletLimits(amountPayload, scope, { updatedBy });
        }
        const updated = await walletService.clearStoreDailyWithdrawOverride(scope, { updatedBy });
        return sendSuccess(res, {
          ...updated,
          canEditDepositWithdrawLimits: true,
          canEditDailyWithdrawMax: true,
          canManageStoreDailyLimits: false,
          scope: { distributorCode: scope.distributorCode, storeCode: scope.storeCode }
        });
      }

      const payload = {};
      // Deposit min/max always come from platform settings for every store.
      if (req.body?.withdrawMin !== undefined) {
        payload.withdrawMin = Math.min(MAX_MONEY_LIMIT, toNonNegativeNumber(req.body.withdrawMin, 10));
      }
      if (req.body?.withdrawMax !== undefined) {
        payload.withdrawMax = Math.min(MAX_MONEY_LIMIT, toPositiveNumber(req.body.withdrawMax, 50));
      }
      if (req.body?.dailyWithdrawMax !== undefined) {
        payload.dailyWithdrawMax = clampMoneyLimit(req.body.dailyWithdrawMax, { allowZero: true });
      }

      if (Object.keys(payload).length === 0) {
        return sendError(res, 'Provide withdrawal limits and/or dailyWithdrawMax to update.', 400);
      }

      if (payload.withdrawMin !== undefined && payload.withdrawMax !== undefined
        && payload.withdrawMax < payload.withdrawMin) {
        return sendError(res, 'Withdrawal max must be greater than or equal to withdrawal min.', 400);
      }
      if (
        payload.dailyWithdrawMax !== undefined
        && Number(payload.dailyWithdrawMax) > 0
        && payload.withdrawMin !== undefined
        && Number(payload.dailyWithdrawMax) < Number(payload.withdrawMin)
      ) {
        return sendError(res, 'Daily withdrawal limit must be greater than or equal to minimum withdrawal per request.', 400);
      }

      const updated = await walletService.updateStoreWalletLimits(payload, scope, { updatedBy });
      return sendSuccess(res, {
        ...updated,
        canEditDepositWithdrawLimits: true,
        canEditDailyWithdrawMax: true,
        canManageStoreDailyLimits: false,
        scope: { distributorCode: scope.distributorCode, storeCode: scope.storeCode }
      });
    }

    // Master / technical staff: set daily limit for a particular store
    const storeScopeRaw = parseStoreScopeFromBody(req.body);
    if (storeScopeRaw && req.body?.dailyWithdrawMax !== undefined && req.body?.depositMin === undefined) {
      const storeScope = await assertStoreScopeExists(storeScopeRaw);
      if (req.body?.usePlatformDefault === true || req.body?.clearOverride === true) {
        const updated = await walletService.clearStoreDailyWithdrawOverride(storeScope, { updatedBy });
        return sendSuccess(res, {
          ...updated,
          canEditDepositWithdrawLimits: true,
          canEditDailyWithdrawMax: true,
          canManageStoreDailyLimits: true,
          scope: storeScope
        });
      }
      const dailyVal = clampMoneyLimit(req.body.dailyWithdrawMax, { allowZero: true });
      const updated = await walletService.updateDailyWithdrawMax(dailyVal, storeScope, {
        updatedBy
      });
      return sendSuccess(res, {
        ...updated,
        canEditDepositWithdrawLimits: true,
        canEditDailyWithdrawMax: true,
        canManageStoreDailyLimits: true,
        scope: storeScope
      });
    }

    // Master admin: full platform limits + optional platform dailyWithdrawMax
    const payload = {
      depositMin: Math.min(MAX_MONEY_LIMIT, toNonNegativeNumber(req.body?.depositMin, 10)),
      depositMax: Math.min(MAX_MONEY_LIMIT, toPositiveNumber(req.body?.depositMax, 5000)),
      withdrawMin: Math.min(MAX_MONEY_LIMIT, toNonNegativeNumber(req.body?.withdrawMin, 10)),
      withdrawMax: Math.min(MAX_MONEY_LIMIT, toPositiveNumber(req.body?.withdrawMax, 50)),
      withdrawLimitHours: toPositiveNumber(req.body?.withdrawLimitHours, 24)
    };

    if (payload.depositMax < payload.depositMin) {
      return sendError(res, 'Deposit max must be greater than or equal to deposit min.', 400);
    }
    if (payload.withdrawMax < payload.withdrawMin) {
      return sendError(res, 'Withdrawal max must be greater than or equal to withdrawal min.', 400);
    }

    if (req.body?.dailyWithdrawMax !== undefined) {
      payload.dailyWithdrawMax = clampMoneyLimit(req.body.dailyWithdrawMax, { allowZero: true });
    }

    if (
      payload.dailyWithdrawMax != null
      && payload.dailyWithdrawMax > 0
      && payload.dailyWithdrawMax < payload.withdrawMin
    ) {
      return sendError(res, 'Daily withdrawal limit must be greater than or equal to minimum withdrawal per request.', 400);
    }

    const updated = await walletService.updateWalletLimits(payload, { updatedBy });
    return sendSuccess(res, {
      ...updated,
      canEditDepositWithdrawLimits: true,
      canEditDailyWithdrawMax: true,
      canManageStoreDailyLimits: true,
      scope: null
    });
  } catch (err) {
    return sendError(res, err.message || 'Unable to update wallet limits.', err.statusCode || 500);
  }
}

/** GET /wallet-limits/stores — master/tech staff: all stores + effective daily limits */
async function listStoreDailyLimits(req, res) {
  try {
    if (!isMasterAdmin(req.role)) {
      return sendError(res, 'Only super admin or technical staff can manage store daily limits.', 403);
    }
    const data = await walletService.listStoreDailyWithdrawLimits();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load store daily limits.', err.statusCode || 500);
  }
}

/** PUT /wallet-limits/stores — master/tech staff: set or clear daily limit for one store */
async function updateStoreDailyLimit(req, res) {
  try {
    if (!isMasterAdmin(req.role)) {
      return sendError(res, 'Only super admin or technical staff can manage store daily limits.', 403);
    }
    const storeScopeRaw = parseStoreScopeFromBody(req.body);
    if (!storeScopeRaw?.storeCode) {
      return sendError(res, 'storeCode is required (and distributorCode when available).', 400);
    }
    const storeScope = await assertStoreScopeExists(storeScopeRaw);
    const updatedBy = req.user?.username || null;

    if (req.body?.usePlatformDefault === true || req.body?.clearOverride === true) {
      const updated = await walletService.clearStoreDailyWithdrawOverride(storeScope, { updatedBy });
      return sendSuccess(res, { ...updated, scope: storeScope });
    }

    if (req.body?.dailyWithdrawMax === undefined) {
      return sendError(res, 'dailyWithdrawMax is required (or set usePlatformDefault: true).', 400);
    }

    const dailyVal = clampMoneyLimit(req.body.dailyWithdrawMax, { allowZero: true });
    const updated = await walletService.updateDailyWithdrawMax(dailyVal, storeScope, {
      updatedBy
    });
    return sendSuccess(res, { ...updated, scope: storeScope });
  } catch (err) {
    return sendError(res, err.message || 'Unable to update store daily limit.', err.statusCode || 500);
  }
}

module.exports = {
  getWalletLimits,
  updateWalletLimits,
  listStoreDailyLimits,
  updateStoreDailyLimit
};
