'use strict';

const affiliateService = require('../../services/affiliate');
const { getAffiliateSettings, updateAffiliateSettings } = require('../../services/affiliate/getAffiliateSettings.service');
const settings = require('../../services/affiliate/getAffiliateSettings.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const db = require('../../db/models');

function canManageAffiliate(req) {
  if (isMasterAdmin(req.role)) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.AFFILIATE);
  }
  if (isStoreAdmin(req.role)) {
    return can(req, STORE_FEATURE_KEYS.AFFILIATE);
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

/** Resolve scope for legacy settings: master = global (null), store_admin = their store. */
function getSettingsScope(req) {
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  return null;
}

async function resolveScope(req) {
  if (!req.user?.userId) return null;
  const user = await db.User.findByPk(req.user.userId, {
    attributes: ['role', 'distributorCode', 'storeCode'],
    raw: true
  });
  if (!user) return null;
  if (isMasterAdmin(user.role)) return null;
  if (user.distributorCode != null || user.storeCode != null) {
    return { distributorCode: user.distributorCode ?? null, storeCode: user.storeCode ?? null };
  }
  return null;
}

async function getStats(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await affiliateService.getAffiliateStats(userId);
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

/** GET /settings: optional auth. When logged in, returns scoped settings; else store_code query or global. */
async function getSettings(req, res) {
  try {
    const scope = await resolveScope(req);
    if (scope) {
      const data = await getAffiliateSettings(scope);
      return sendSuccess(res, data);
    }
    const storeCode = req.query?.store_code ?? req.query?.storeCode;
    if (storeCode != null && String(storeCode).trim()) {
      const data = await settings.getEffectiveSettingsForStoreCode(String(storeCode).trim());
      return sendSuccess(res, data);
    }
    const data = await getAffiliateSettings(null);
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

/** Legacy admin: get settings for current scope. */
async function getSettingsAdmin(req, res) {
  try {
    if (!canManageAffiliate(req)) {
      return sendError(res, "You don't have access to Refer & Earn (affiliate) settings.", 403);
    }
    if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
      const data = await settings.getEffectiveSettings(req.distributorCode, req.storeCode);
      return sendSuccess(res, data);
    }
    const scope = getSettingsScope(req);
    const data = await getAffiliateSettings(scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Unable to load affiliate settings.';
    sendError(res, message, status);
  }
}

/** Legacy admin: update settings for current scope. */
async function updateSettings(req, res) {
  try {
    if (!canManageAffiliate(req)) {
      return sendError(res, "You don't have access to Refer & Earn (affiliate) settings.", 403);
    }
    const body = req.body || {};
    if (isStoreAdmin(req.role)) {
      if (req.distributorCode == null || req.storeCode == null) {
        return sendError(res, 'Store scope is required.', 403);
      }
      const updated = await settings.upsertStoreSettings(
        { distributorCode: req.distributorCode, storeCode: req.storeCode },
        body,
        { updatedBy: req.user?.username || req.user?.email || null }
      );
      return sendSuccess(res, updated);
    }
    const scope = getSettingsScope(req);
    const data = await updateAffiliateSettings(
      { ...body, updatedBy: req.user?.username || req.user?.email || null },
      scope
    );
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Unable to save affiliate settings.';
    sendError(res, message, status);
  }
}

/** Admin: reset to default (store admin only; removes store override). */
async function resetToDefault(req, res) {
  try {
    if (!canManageAffiliate(req)) {
      return sendError(res, "You don't have access to Refer & Earn (affiliate) settings.", 403);
    }
    if (!isStoreAdmin(req.role) || req.distributorCode == null || req.storeCode == null) {
      return sendError(res, 'Only store admins can reset affiliate settings to default for their store.', 403);
    }
    const scope = { distributorCode: req.distributorCode, storeCode: req.storeCode };
    await affiliateService.resetAffiliateSettingsToDefault(scope);
    sendSuccess(res, { message: 'Affiliate settings reset to default for your store.' });
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Unable to reset.';
    sendError(res, message, status);
  }
}

/** GET /admin/stores — master/tech: all stores; store_admin: own store */
async function listStores(req, res) {
  try {
    if (!canManageAffiliate(req)) {
      return sendError(res, 'You do not have permission to manage Refer & Earn settings.', 403);
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
    return sendError(res, err.message || 'Unable to load Refer & Earn settings.', err.statusCode || 500);
  }
}

/** PUT /admin/stores — update one store; store_admin pinned to own scope */
async function updateStore(req, res) {
  try {
    if (!canManageAffiliate(req)) {
      return sendError(res, 'You do not have permission to manage Refer & Earn settings.', 403);
    }

    const body = req.body || {};
    let scope;

    if (isMasterAdmin(req.role)) {
      const rawScope = parseStoreScopeFromBody(body);
      if (!rawScope?.storeCode) {
        return sendError(res, 'storeCode is required (and distributorCode when available).', 400);
      }
      scope = await settings.resolveStoreScope(rawScope);
    } else if (isStoreAdmin(req.role)) {
      if (req.distributorCode == null || req.storeCode == null) {
        return sendError(res, 'Store scope is required.', 403);
      }
      scope = {
        distributorCode: req.distributorCode,
        storeCode: req.storeCode
      };
    } else {
      return sendError(res, 'Access denied.', 403);
    }

    if (!isMasterAdmin(req.role)) {
      const current = await settings.getEffectiveSettings(scope.distributorCode, scope.storeCode);
      body.programMode = current.programMode;
    }

    const updatedBy = req.user?.username || req.user?.email || null;
    const updated = await settings.upsertStoreSettings(scope, body, { updatedBy });
    return sendSuccess(res, updated);
  } catch (err) {
    return sendError(res, err.message || 'Unable to update Refer & Earn settings.', err.statusCode || 400);
  }
}

module.exports = {
  getStats,
  getSettings,
  getSettingsAdmin,
  updateSettings,
  resetToDefault,
  listStores,
  updateStore
};
