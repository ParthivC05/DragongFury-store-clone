'use strict';

const dailyBonus = require('../../services/dailyBonus');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

const settings = dailyBonus.dailyBonusSettings;

function canManageDailyBonus(req) {
  if (isMasterAdmin(req.role)) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.DAILY_BONUS);
  }
  if (isStoreAdmin(req.role)) {
    return can(req, STORE_FEATURE_KEYS.DAILY_BONUS);
  }
  return false;
}

function parseStoreScopeFromBody(body = {}) {
  const storeCode = body.store_code ?? body.storeCode;
  const distributorCode = body.distributor_code ?? body.distributorCode;
  if (storeCode == null || String(storeCode).trim() === '') return null;
  return {
    storeCode: String(storeCode).trim(),
    distributorCode:
      distributorCode != null && String(distributorCode).trim() !== ''
        ? String(distributorCode).trim()
        : null
  };
}

async function getStatus(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const start = req.query.start !== 'false' && req.query.start !== '0';
    const data = await dailyBonus.getDailyBonusStatus(userId, { start });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load daily bonus.', err.statusCode || 500);
  }
}

async function claim(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const dayIndex = req.body?.dayIndex ?? req.body?.day_index;
    const data = await dailyBonus.claimDailyBonus(userId, dayIndex);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to claim daily bonus.', err.statusCode || 500);
  }
}

async function spin(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await dailyBonus.performDailyBonusSpin(userId);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to spin.', err.statusCode || 500);
  }
}

async function listVouchers(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const vouchers = await dailyBonus.listAvailableVouchersForUser(userId);
    return sendSuccess(res, { vouchers });
  } catch (err) {
    return sendError(res, err.message || 'Unable to load vouchers.', err.statusCode || 500);
  }
}

async function listStores(req, res) {
  try {
    if (!canManageDailyBonus(req)) {
      return sendError(res, 'You do not have permission to manage daily bonus settings.', 403);
    }
    if (isMasterAdmin(req.role)) {
      const data = await settings.listAllStoreSettings();
      return sendSuccess(res, data);
    }
    if (!isStoreAdmin(req.role) || req.distributorCode == null || req.storeCode == null) {
      return sendError(res, 'Store scope is required.', 403);
    }
    const data = await settings.listOwnStoreSettings({
      distributorCode: req.distributorCode,
      storeCode: req.storeCode
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load daily bonus settings.', err.statusCode || 500);
  }
}

async function updateStore(req, res) {
  try {
    if (!canManageDailyBonus(req)) {
      return sendError(res, 'You do not have permission to manage daily bonus settings.', 403);
    }

    const body = req.body || {};
    let scope;
    if (isMasterAdmin(req.role)) {
      scope = parseStoreScopeFromBody(body);
      if (!scope) return sendError(res, 'storeCode is required.', 400);
    } else {
      scope = {
        distributorCode: req.distributorCode,
        storeCode: req.storeCode
      };
    }

    const updatedBy =
      req.user?.email || req.user?.username || (req.user?.userId != null ? `user:${req.user.userId}` : null);

    const data = await settings.upsertStoreSettings(scope, body, { updatedBy });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to update daily bonus settings.', err.statusCode || 500);
  }
}

async function listPackages(req, res) {
  try {
    if (!canManageDailyBonus(req)) {
      return sendError(res, 'You do not have permission to manage daily bonus settings.', 403);
    }
    let scope;
    if (isMasterAdmin(req.role)) {
      scope = parseStoreScopeFromBody({
        storeCode: req.query.store_code ?? req.query.storeCode,
        distributorCode: req.query.distributor_code ?? req.query.distributorCode
      });
      if (!scope) return sendError(res, 'storeCode is required.', 400);
    } else {
      scope = {
        distributorCode: req.distributorCode,
        storeCode: req.storeCode
      };
    }
    const data = await settings.listPackagesForStore(scope);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load packages.', err.statusCode || 500);
  }
}

module.exports = {
  getStatus,
  claim,
  spin,
  listVouchers,
  listStores,
  updateStore,
  listPackages
};
