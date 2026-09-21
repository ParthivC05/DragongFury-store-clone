const spinWheelService = require('../../services/spinWheel');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin, ROLES } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const db = require('../../db/models');
const { Op } = require('sequelize');

async function resolvePublicConfigScope(req) {
  const storeCode = req.query.store_code && String(req.query.store_code).trim();
  if (!storeCode) return null;

  const storeAdmin = await db.User.findOne({
    where: { role: ROLES.STORE_ADMIN, storeCode },
    attributes: ['distributorCode', 'storeCode'],
    raw: true,
  });
  if (storeAdmin) {
    return {
      distributorCode: storeAdmin.distributorCode ?? null,
      storeCode: storeAdmin.storeCode ?? storeCode,
    };
  }
  return { distributorCode: null, storeCode };
}

async function getConfig(req, res) {
  try {
    const scope = await resolvePublicConfigScope(req);
    const data = await spinWheelService.getSpinWheelPublicConfig(scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function getStatus(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await spinWheelService.getSpinWheelStatus(userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function spin(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await spinWheelService.performSpin(userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

function readScopeFromRequest(req) {
  const q = req.query || {};
  const b = req.body || {};
  const storeCode = String(q.storeCode || q.store_code || b.storeCode || b.store_code || '').trim();
  const distributorCode = String(
    q.distributorCode || q.distributor_code || b.distributorCode || b.distributor_code || ''
  ).trim();
  return {
    storeCode: storeCode || '',
    distributorCode: distributorCode || ''
  };
}

/** Store admin = their store. Master = optional store from query/body, else platform default. */
async function getSettingsScope(req) {
  if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  if (!isMasterAdmin(req.role)) return null;

  const { storeCode, distributorCode } = readScopeFromRequest(req);
  if (!storeCode) return null;

  const storeWhere = { role: ROLES.STORE_ADMIN, storeCode: { [Op.iLike]: storeCode } };
  const storeAdmin =
    (await db.User.findOne({
      where: { ...storeWhere, storeRoleId: null },
      attributes: ['distributorCode', 'storeCode'],
      raw: true
    })) ||
    (await db.User.findOne({
      where: storeWhere,
      attributes: ['distributorCode', 'storeCode'],
      raw: true
    }));
  if (!storeAdmin) {
    const err = new Error('Store not found.');
    err.statusCode = 404;
    throw err;
  }
  return {
    distributorCode: distributorCode || storeAdmin.distributorCode || null,
    storeCode: storeAdmin.storeCode || storeCode
  };
}

async function getConfigMe(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const user = await require('../../db/models').User.findByPk(userId, { attributes: ['distributorCode', 'storeCode'], raw: true });
    const scope = user && (user.distributorCode != null || user.storeCode != null)
      ? { distributorCode: user.distributorCode ?? null, storeCode: user.storeCode ?? null }
      : null;
    const data = await spinWheelService.getSpinWheelPublicConfig(scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function getSettings(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.SPIN_WHEEL)) return sendError(res, 'You don\'t have access to Spin wheel settings. Please contact your administrator if you need access.', 403);
    const scope = await getSettingsScope(req);
    const data = await spinWheelService.getSpinWheelSettings(scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function updateSettings(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.SPIN_WHEEL)) return sendError(res, 'You don\'t have access to Spin wheel settings. Please contact your administrator if you need access.', 403);
    const scope = await getSettingsScope(req);
    const applyToAllStores = isMasterAdmin(req.role) && !scope;
    const data = await spinWheelService.updateSpinWheelSettings(req.body, scope, { applyToAllStores });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function resetToDefault(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.SPIN_WHEEL)) return sendError(res, 'You don\'t have access to Spin wheel settings. Please contact your administrator if you need access.', 403);
    const scope = await getSettingsScope(req);
    if (isMasterAdmin(req.role)) {
      if (!scope) {
        return sendError(res, 'Select a store to reset, or save All stores to push the platform wheel.', 400);
      }
      await spinWheelService.resetSpinWheelSettingsToDefault(scope);
      return sendSuccess(res, { message: 'Spin wheel settings reset to platform default for that store.' });
    }
    if (!isStoreAdmin(req.role) || req.distributorCode == null || req.storeCode == null) {
      return sendError(res, 'Only store admins can reset spin wheel to default for their store.', 403);
    }
    await spinWheelService.resetSpinWheelSettingsToDefault({
      distributorCode: req.distributorCode,
      storeCode: req.storeCode
    });
    sendSuccess(res, { message: 'Spin wheel settings reset to default for your store.' });
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

module.exports = {
  getConfig,
  getConfigMe,
  getStatus,
  spin,
  getSettings,
  updateSettings,
  resetToDefault
};
