const landingPaymentLinksService = require('../../services/landingPaymentLinks');
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

function assertCanEditLandingPaymentLinks(req) {
  if (isMasterAdmin(req.role) || isDistributorAdmin(req.role)) return true;
  if (isStoreAdmin(req.role) && can(req, STORE_FEATURE_KEYS.LANDING_PAYMENT_LINKS)) return true;
  return false;
}

async function getPublicConfig(req, res) {
  try {
    const scope = await landingPaymentLinksService.resolveScopeFromStoreCode(req.query.store_code);
    const data = await landingPaymentLinksService.getLandingPaymentLinksSettings(scope);
    sendSuccess(res, { landingPaymentLinks: data });
  } catch (err) {
    sendError(res, err.message || 'Unable to load landing payment links.', err.statusCode || 500);
  }
}

async function getSettingsAdmin(req, res) {
  try {
    if (!assertCanEditLandingPaymentLinks(req)) {
      return sendError(res, 'You do not have permission to manage landing payment links.', 403);
    }
    const scope = getSettingsScope(req);
    const data = await landingPaymentLinksService.getLandingPaymentLinksSettings(scope);
    sendSuccess(res, { landingPaymentLinks: data, scope: scope || 'global' });
  } catch (err) {
    sendError(res, err.message || 'Unable to load landing payment links.', err.statusCode || 500);
  }
}

async function updateSettingsAdmin(req, res) {
  try {
    if (!assertCanEditLandingPaymentLinks(req)) {
      return sendError(res, 'You do not have permission to manage landing payment links.', 403);
    }
    const scope = getSettingsScope(req);
    const body = req.body?.landingPaymentLinks ?? req.body ?? {};
    const data = await landingPaymentLinksService.updateLandingPaymentLinksSettings(body, scope);
    sendSuccess(res, { landingPaymentLinks: data, message: 'Landing payment links saved.' });
  } catch (err) {
    sendError(res, err.message || 'Unable to save landing payment links.', err.statusCode || 500);
  }
}

async function deleteSettingsAdmin(req, res) {
  try {
    if (!assertCanEditLandingPaymentLinks(req)) {
      return sendError(res, 'You do not have permission to manage landing payment links.', 403);
    }
    if (isStoreAdmin(req.role)) {
      if (req.distributorCode == null || req.storeCode == null) {
        return sendError(res, 'Store scope required.', 403);
      }
      const scope = { distributorCode: req.distributorCode, storeCode: req.storeCode };
      const data = await landingPaymentLinksService.deleteLandingPaymentLinksSettings(scope);
      return sendSuccess(res, { landingPaymentLinks: data, message: 'Landing payment links cleared for your store.' });
    }
    if (isMasterAdmin(req.role)) {
      const data = await landingPaymentLinksService.deleteLandingPaymentLinksSettings(null);
      return sendSuccess(res, { landingPaymentLinks: data, message: 'Global landing payment links cleared.' });
    }
    return sendError(res, 'Forbidden.', 403);
  } catch (err) {
    sendError(res, err.message || 'Unable to clear landing payment links.', err.statusCode || 500);
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
    can(req, STORE_FEATURE_KEYS.LANDING_PAYMENT_LINKS)
  ) {
    return true;
  }
  return false;
}

async function getStoreLandingPaymentLinks(req, res) {
  try {
    const { store, scope } = await landingPaymentLinksService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to view this store\'s landing payment links.', 403);
    }
    const data = await landingPaymentLinksService.getLandingPaymentLinksSettings(scope);
    sendSuccess(res, {
      landingPaymentLinks: data,
      storeId: store.userId,
      storeCode: store.storeCode,
      distributorCode: store.distributorCode,
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to load landing payment links.', err.statusCode || 404);
  }
}

async function updateStoreLandingPaymentLinks(req, res) {
  try {
    const { store, scope } = await landingPaymentLinksService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to update this store\'s landing payment links.', 403);
    }
    const body = req.body?.landingPaymentLinks ?? req.body ?? {};
    const data = await landingPaymentLinksService.updateLandingPaymentLinksSettings(body, scope);
    sendSuccess(res, {
      landingPaymentLinks: data,
      storeId: store.userId,
      message: 'Landing payment links saved.',
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to save landing payment links.', err.statusCode || 500);
  }
}

async function deleteStoreLandingPaymentLinks(req, res) {
  try {
    const { store, scope } = await landingPaymentLinksService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to clear this store\'s landing payment links.', 403);
    }
    const data = await landingPaymentLinksService.deleteLandingPaymentLinksSettings(scope);
    sendSuccess(res, {
      landingPaymentLinks: data,
      storeId: store.userId,
      message: 'Landing payment links cleared for this store.',
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to clear landing payment links.', err.statusCode || 404);
  }
}

/** POST /admin/modal-image-upload — upload landing payment redirect modal image to S3 */
async function uploadModalImage(req, res) {
  try {
    if (!assertCanEditLandingPaymentLinks(req)) {
      return sendError(res, 'You do not have permission to manage landing payment links.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    assertWebpUpload(file, { maxBytes: DESKTOP_MAX_BYTES, label: 'Image' });
    const url = await uploadImageBuffer(file.buffer, {
      contentType: 'image/webp',
      keyPrefix: 'landing-payment-links',
    });
    return sendSuccess(res, { data: { url } });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  getPublicConfig,
  getSettingsAdmin,
  updateSettingsAdmin,
  deleteSettingsAdmin,
  getStoreLandingPaymentLinks,
  updateStoreLandingPaymentLinks,
  deleteStoreLandingPaymentLinks,
  uploadModalImage,
};
