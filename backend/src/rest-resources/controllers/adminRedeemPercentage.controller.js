'use strict';

const {
  getRedeemPercentage,
  updateRedeemPercentage,
  resetRedeemPercentageToDefault,
  listStoreRedeemPercentages,
  DEFAULT_REDEEM_PERCENTAGE
} = require('../../services/games/getRedeemPercentage.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');

function canAccessRedeemPercentage(req) {
  if (isMasterAdmin(req.role)) return true;
  if (isStoreAdmin(req.role)) {
    return (
      can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS) ||
      can(req, STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS)
    );
  }
  return false;
}

function getStoreAdminScope(req) {
  if (isStoreAdmin(req.role) && req.storeCode != null && String(req.storeCode).trim()) {
    return {
      distributorCode:
        req.distributorCode != null && String(req.distributorCode).trim()
          ? String(req.distributorCode).trim()
          : null,
      storeCode: String(req.storeCode).trim()
    };
  }
  return null;
}

function parseScopeFromQueryOrBody(source) {
  const distributorCode =
    source?.distributorCode != null && String(source.distributorCode).trim()
      ? String(source.distributorCode).trim()
      : null;
  const storeCode =
    source?.storeCode != null && String(source.storeCode).trim()
      ? String(source.storeCode).trim()
      : null;
  if (!distributorCode && !storeCode) return null;
  return { distributorCode, storeCode };
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
  return {
    distributorCode: stores[0].distributorCode ?? null,
    storeCode: stores[0].storeCode
  };
}

async function toResponse(data, scope) {
  let platformPercentage = data.percentage;
  if (scope) {
    const global = await getRedeemPercentage(null);
    platformPercentage = global.percentage;
  }
  return {
    percentage: data.percentage,
    isStoreOverride: data.isStoreOverride,
    source: data.source,
    defaultPercentage: DEFAULT_REDEEM_PERCENTAGE,
    platformPercentage,
    scope: scope
      ? { distributorCode: scope.distributorCode, storeCode: scope.storeCode }
      : null
  };
}

/**
 * GET /admin/redeem-percentage
 * Master: global by default; optional ?distributorCode=&storeCode= for a store.
 * Store admin: their store (with global fallback).
 */
async function getRedeemPercentageAdmin(req, res) {
  try {
    if (!canAccessRedeemPercentage(req)) {
      return sendError(res, 'You do not have permission to view redeem percentage.', 403);
    }

    let scope = null;
    if (isMasterAdmin(req.role)) {
      const qScope = parseScopeFromQueryOrBody(req.query);
      if (qScope?.storeCode) {
        scope = await assertStoreScopeExists(qScope);
      } else {
        scope = null;
      }
    } else if (isStoreAdmin(req.role)) {
      scope = getStoreAdminScope(req);
      if (!scope?.storeCode) {
        return sendError(res, 'Store context is required to view redeem percentage.', 400);
      }
    } else {
      return sendError(res, 'You do not have permission to view redeem percentage.', 403);
    }

    const data = await getRedeemPercentage(scope);
    return sendSuccess(res, await toResponse(data, scope));
  } catch (err) {
    return sendError(res, err.message || 'Unable to load redeem percentage.', err.statusCode || 500);
  }
}

/**
 * GET /admin/redeem-percentage/stores
 * Master/tech staff: all stores with effective redeem win %.
 */
async function listStoreRedeemPercentagesAdmin(req, res) {
  try {
    if (!isMasterAdmin(req.role)) {
      return sendError(res, 'Only super admin or technical staff can list store redeem percentages.', 403);
    }
    const data = await listStoreRedeemPercentages();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load store redeem percentages.', err.statusCode || 500);
  }
}

/**
 * PUT /admin/redeem-percentage
 * Body: { percentage, distributorCode?, storeCode? }
 * Master without store codes → global; with storeCode → that store.
 * Store admin → own store only.
 */
async function updateRedeemPercentageAdmin(req, res) {
  try {
    if (!canAccessRedeemPercentage(req)) {
      return sendError(res, 'You do not have permission to update redeem percentage.', 403);
    }

    if (req.body?.percentage === undefined || req.body?.percentage === null || req.body?.percentage === '') {
      return sendError(res, 'percentage is required (0–100).', 400);
    }

    let scope = null;
    if (isMasterAdmin(req.role)) {
      const bodyScope = parseScopeFromQueryOrBody(req.body);
      if (bodyScope?.storeCode) {
        scope = await assertStoreScopeExists(bodyScope);
      } else if (bodyScope && !bodyScope.storeCode) {
        // distributorCode without storeCode must not silently update global
        return sendError(res, 'storeCode is required to update a store redeem percentage.', 400);
      } else {
        scope = null;
      }
    } else if (isStoreAdmin(req.role)) {
      scope = getStoreAdminScope(req);
      if (!scope?.storeCode) {
        return sendError(res, 'Store context is required to set redeem percentage.', 400);
      }
    } else {
      return sendError(res, 'You do not have permission to update redeem percentage.', 403);
    }

    const data = await updateRedeemPercentage(req.body.percentage, scope);
    return sendSuccess(res, await toResponse(data, scope));
  } catch (err) {
    return sendError(res, err.message || 'Unable to update redeem percentage.', err.statusCode || 500);
  }
}

/**
 * POST /admin/redeem-percentage/reset-to-default
 * Store admin: clear own override.
 * Master: body { distributorCode, storeCode } to clear a store override.
 */
async function resetRedeemPercentageAdmin(req, res) {
  try {
    if (!canAccessRedeemPercentage(req)) {
      return sendError(res, 'You do not have permission to reset redeem percentage.', 403);
    }

    let scope = null;
    if (isMasterAdmin(req.role)) {
      const bodyScope = parseScopeFromQueryOrBody(req.body);
      if (!bodyScope?.storeCode) {
        return sendError(res, 'Provide distributorCode and storeCode to reset a store override.', 400);
      }
      scope = await assertStoreScopeExists(bodyScope);
    } else if (isStoreAdmin(req.role)) {
      scope = getStoreAdminScope(req);
      if (!scope?.storeCode) {
        return sendError(res, 'Store context is required to reset redeem percentage.', 400);
      }
    } else {
      return sendError(res, 'You do not have permission to reset redeem percentage.', 403);
    }

    const data = await resetRedeemPercentageToDefault(scope);
    return sendSuccess(res, {
      ...(await toResponse(data, scope)),
      message: 'Redeem percentage reset to platform default for this store.'
    });
  } catch (err) {
    return sendError(res, err.message || 'Unable to reset redeem percentage.', err.statusCode || 500);
  }
}

module.exports = {
  getRedeemPercentageAdmin,
  listStoreRedeemPercentagesAdmin,
  updateRedeemPercentageAdmin,
  resetRedeemPercentageAdmin
};
