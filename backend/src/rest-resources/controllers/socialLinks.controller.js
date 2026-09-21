const socialLinksService = require('../../services/socialLinks');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin, isDistributorAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

async function getSettingsScope(req) {
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.storeCode) {
    return socialLinksService.resolveScopeFromStoreCode(req.storeCode);
  }
  return null;
}

function assertCanEditSocialLinks(req) {
  // Super admin (no admin role) and technical staff with social_links permission.
  if (isMasterAdmin(req.role) && canAdmin(req, ADMIN_FEATURE_KEYS.SOCIAL_LINKS)) return true;
  if (isDistributorAdmin(req.role)) return true;
  if (isStoreAdmin(req.role) && can(req, STORE_FEATURE_KEYS.SOCIAL_LINKS)) return true;
  return false;
}

async function getPublicConfig(req, res) {
  try {
    const scope = await socialLinksService.resolveScopeFromStoreCode(req.query.store_code);
    const data = await socialLinksService.getSocialLinksSettings(scope);
    sendSuccess(res, { socialLinks: data });
  } catch (err) {
    sendError(res, err.message || 'Unable to load social links.', err.statusCode || 500);
  }
}

async function getSettingsAdmin(req, res) {
  try {
    if (!assertCanEditSocialLinks(req)) {
      return sendError(res, 'You do not have permission to manage social media links.', 403);
    }
    const scope = await getSettingsScope(req);
    const data = await socialLinksService.getSocialLinksSettings(scope);
    sendSuccess(res, { socialLinks: data, scope: scope || 'global' });
  } catch (err) {
    sendError(res, err.message || 'Unable to load social links.', err.statusCode || 500);
  }
}

async function updateSettingsAdmin(req, res) {
  try {
    if (!assertCanEditSocialLinks(req)) {
      return sendError(res, 'You do not have permission to manage social media links.', 403);
    }
    const scope = await getSettingsScope(req);
    const body = req.body?.socialLinks ?? req.body ?? {};
    const data = await socialLinksService.updateSocialLinksSettings(body, scope);
    sendSuccess(res, { socialLinks: data, message: 'Social media links saved.' });
  } catch (err) {
    sendError(res, err.message || 'Unable to save social links.', err.statusCode || 500);
  }
}

async function deleteSettingsAdmin(req, res) {
  try {
    if (!assertCanEditSocialLinks(req)) {
      return sendError(res, 'You do not have permission to manage social media links.', 403);
    }
    if (isStoreAdmin(req.role)) {
      const scope = await getSettingsScope(req);
      if (!scope?.storeCode) {
        return sendError(res, 'Store scope required.', 403);
      }
      const data = await socialLinksService.deleteSocialLinksSettings(scope);
      return sendSuccess(res, { socialLinks: data, message: 'Social media links cleared for your store.' });
    }
    if (isMasterAdmin(req.role)) {
      const data = await socialLinksService.deleteSocialLinksSettings(null);
      return sendSuccess(res, { socialLinks: data, message: 'Global social media links cleared.' });
    }
    return sendError(res, 'Forbidden.', 403);
  } catch (err) {
    sendError(res, err.message || 'Unable to clear social links.', err.statusCode || 500);
  }
}

function assertCanManageStore(req, store) {
  // Super admin + technical staff (social_links) can manage any store's landing links.
  if (isMasterAdmin(req.role) && canAdmin(req, ADMIN_FEATURE_KEYS.SOCIAL_LINKS)) return true;
  if (isDistributorAdmin(req.role) && req.distributorCode && store.distributorCode === req.distributorCode) {
    return true;
  }
  if (
    isStoreAdmin(req.role) &&
    req.storeRoleId == null &&
    req.user?.userId === store.userId &&
    can(req, STORE_FEATURE_KEYS.SOCIAL_LINKS)
  ) {
    return true;
  }
  return false;
}

async function getStoreSocialLinks(req, res) {
  try {
    const { store, scope } = await socialLinksService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to view this store\'s social media links.', 403);
    }
    const data = await socialLinksService.getSocialLinksSettings(scope);
    sendSuccess(res, {
      socialLinks: data,
      storeId: store.userId,
      storeCode: store.storeCode,
      distributorCode: store.distributorCode,
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to load social links.', err.statusCode || 404);
  }
}

async function updateStoreSocialLinks(req, res) {
  try {
    const { store, scope } = await socialLinksService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to update this store\'s social media links.', 403);
    }
    const body = req.body?.socialLinks ?? req.body ?? {};
    const data = await socialLinksService.updateSocialLinksSettings(body, scope);
    sendSuccess(res, {
      socialLinks: data,
      storeId: store.userId,
      message: 'Social media links saved.',
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to save social links.', err.statusCode || 500);
  }
}

async function deleteStoreSocialLinks(req, res) {
  try {
    const { store, scope } = await socialLinksService.resolveScopeFromStoreUserId(req.params.id);
    if (!assertCanManageStore(req, store)) {
      return sendError(res, 'You do not have permission to clear this store\'s social media links.', 403);
    }
    const data = await socialLinksService.deleteSocialLinksSettings(scope);
    sendSuccess(res, {
      socialLinks: data,
      storeId: store.userId,
      message: 'Social media links cleared for this store.',
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to clear social links.', err.statusCode || 404);
  }
}

module.exports = {
  getPublicConfig,
  getSettingsAdmin,
  updateSettingsAdmin,
  deleteSettingsAdmin,
  getStoreSocialLinks,
  updateStoreSocialLinks,
  deleteStoreSocialLinks,
};
