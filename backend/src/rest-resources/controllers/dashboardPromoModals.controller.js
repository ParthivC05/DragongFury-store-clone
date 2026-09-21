'use strict';

const dashboardPromoModalsService = require('../../services/dashboardPromoModals');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin, isDistributorAdmin } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { uploadImageBuffer } = require('../../utils/s3Upload');
const { DESKTOP_MAX_BYTES, assertWebpUpload } = require('../../utils/adminImageUploadConstraints');

function getSettingsScope(req) {
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  return null;
}

function assertCanEditDashboardPromoModals(req) {
  if (isMasterAdmin(req.role) || isDistributorAdmin(req.role)) return true;
  if (isStoreAdmin(req.role) && can(req, STORE_FEATURE_KEYS.DASHBOARD_PROMO_MODALS)) return true;
  return false;
}

function resolveUserStoreScope(req) {
  const distributorCode = req.user?.distributorCode ?? req.distributorCode ?? null;
  const storeCode = req.user?.storeCode ?? req.storeCode ?? null;
  if (distributorCode != null || storeCode != null) {
    return { distributorCode, storeCode };
  }
  return null;
}

async function getUserConfig(req, res) {
  try {
    // Prefer store_code resolution so we match the same scoped settings admins save.
    const storeCode = req.user?.storeCode ?? req.storeCode ?? null;
    const scope = storeCode
      ? await dashboardPromoModalsService.resolveScopeFromStoreCode(storeCode)
      : resolveUserStoreScope(req);
    const data = await dashboardPromoModalsService.getDashboardPromoModalsSettings(scope);
    sendSuccess(res, { dashboardPromoModals: data });
  } catch (err) {
    sendError(res, err.message || 'Unable to load dashboard promo modals.', err.statusCode || 500);
  }
}

async function getSettingsAdmin(req, res) {
  try {
    if (!assertCanEditDashboardPromoModals(req)) {
      return sendError(res, 'You do not have permission to manage dashboard promo modals.', 403);
    }
    const scope = getSettingsScope(req);
    const data = await dashboardPromoModalsService.getDashboardPromoModalsSettings(scope);
    sendSuccess(res, { dashboardPromoModals: data, scope: scope || 'global' });
  } catch (err) {
    sendError(res, err.message || 'Unable to load dashboard promo modals.', err.statusCode || 500);
  }
}

async function updateSettingsAdmin(req, res) {
  try {
    if (!assertCanEditDashboardPromoModals(req)) {
      return sendError(res, 'You do not have permission to manage dashboard promo modals.', 403);
    }
    const scope = getSettingsScope(req);
    const body = req.body?.dashboardPromoModals ?? req.body ?? {};
    const data = await dashboardPromoModalsService.updateDashboardPromoModalsSettings(body, scope);
    sendSuccess(res, { dashboardPromoModals: data, message: 'Dashboard promo modals saved.' });
  } catch (err) {
    sendError(res, err.message || 'Unable to save dashboard promo modals.', err.statusCode || 500);
  }
}

async function deleteSettingsAdmin(req, res) {
  try {
    if (!assertCanEditDashboardPromoModals(req)) {
      return sendError(res, 'You do not have permission to manage dashboard promo modals.', 403);
    }
    if (isStoreAdmin(req.role)) {
      if (req.distributorCode == null || req.storeCode == null) {
        return sendError(res, 'Store scope required.', 403);
      }
      const scope = { distributorCode: req.distributorCode, storeCode: req.storeCode };
      const data = await dashboardPromoModalsService.deleteDashboardPromoModalsSettings(scope);
      return sendSuccess(res, {
        dashboardPromoModals: data,
        message: 'Dashboard promo modals reset for your store.',
      });
    }
    if (isMasterAdmin(req.role)) {
      const data = await dashboardPromoModalsService.deleteDashboardPromoModalsSettings(null);
      return sendSuccess(res, {
        dashboardPromoModals: data,
        message: 'Global dashboard promo modals reset.',
      });
    }
    return sendError(res, 'Forbidden.', 403);
  } catch (err) {
    sendError(res, err.message || 'Unable to reset dashboard promo modals.', err.statusCode || 500);
  }
}

function assertCanManageStore(req, store) {
  if (isMasterAdmin(req.role)) return true;
  if (isDistributorAdmin(req.role) && req.distributorCode && store.distributorCode === req.distributorCode) {
    return true;
  }
  if (
    isStoreAdmin(req.role) &&
    req.storeRoleId == null &&
    req.user?.userId === store.userId &&
    can(req, STORE_FEATURE_KEYS.DASHBOARD_PROMO_MODALS)
  ) {
    return true;
  }
  return false;
}

async function getStoreDashboardPromoModals(req, res) {
  try {
    const { store, scope } = await dashboardPromoModalsService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to view this store\'s dashboard promo modals.', 403);
    }
    const data = await dashboardPromoModalsService.getDashboardPromoModalsSettings(scope);
    sendSuccess(res, {
      dashboardPromoModals: data,
      storeId: store.userId,
      storeCode: store.storeCode,
      distributorCode: store.distributorCode,
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to load dashboard promo modals.', err.statusCode || 404);
  }
}

async function updateStoreDashboardPromoModals(req, res) {
  try {
    const { store, scope } = await dashboardPromoModalsService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to update this store\'s dashboard promo modals.', 403);
    }
    const body = req.body?.dashboardPromoModals ?? req.body ?? {};
    const data = await dashboardPromoModalsService.updateDashboardPromoModalsSettings(body, scope);
    sendSuccess(res, {
      dashboardPromoModals: data,
      storeId: store.userId,
      message: 'Dashboard promo modals saved.',
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to save dashboard promo modals.', err.statusCode || 500);
  }
}

async function deleteStoreDashboardPromoModals(req, res) {
  try {
    const { store, scope } = await dashboardPromoModalsService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to reset this store\'s dashboard promo modals.', 403);
    }
    const data = await dashboardPromoModalsService.deleteDashboardPromoModalsSettings(scope);
    sendSuccess(res, {
      dashboardPromoModals: data,
      storeId: store.userId,
      message: 'Dashboard promo modals reset for this store.',
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to reset dashboard promo modals.', err.statusCode || 404);
  }
}

async function uploadModalImage(req, res) {
  try {
    if (!assertCanEditDashboardPromoModals(req)) {
      return sendError(res, 'You do not have permission to manage dashboard promo modals.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    assertWebpUpload(file, { maxBytes: DESKTOP_MAX_BYTES, label: 'Image' });
    const url = await uploadImageBuffer(file.buffer, {
      contentType: 'image/webp',
      keyPrefix: 'dashboard-promo-modals',
    });
    return sendSuccess(res, { data: { url } });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  getUserConfig,
  getSettingsAdmin,
  updateSettingsAdmin,
  deleteSettingsAdmin,
  getStoreDashboardPromoModals,
  updateStoreDashboardPromoModals,
  deleteStoreDashboardPromoModals,
  uploadModalImage,
};
