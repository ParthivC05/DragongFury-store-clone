'use strict';

const welcomeSignupBonusService = require('../../services/welcomeSignupBonus');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { uploadImageBuffer } = require('../../utils/s3Upload');
const { DESKTOP_MAX_BYTES, assertWebpUpload } = require('../../utils/adminImageUploadConstraints');

const settings = welcomeSignupBonusService.welcomeSignupBonusSettings;

function canManageWelcomeSignupBonus(req) {
  if (isMasterAdmin(req.role)) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS);
  }
  if (isStoreAdmin(req.role)) {
    return can(req, STORE_FEATURE_KEYS.WELCOME_SIGNUP_BONUS);
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

/** GET /public?store_code= — landing modal image + bonus display info */
async function getPublic(req, res) {
  try {
    const storeCode = req.query.store_code ?? req.query.storeCode;
    const data = await settings.getPublicSettingsForStoreCode(storeCode);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load welcome signup bonus.', err.statusCode || 500);
  }
}

/** GET /admin/stores — master: all stores; store_admin: own store only */
async function listStores(req, res) {
  try {
    if (!canManageWelcomeSignupBonus(req)) {
      return sendError(res, 'You do not have permission to manage welcome signup bonus settings.', 403);
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
    return sendError(res, err.message || 'Unable to load welcome signup bonus settings.', err.statusCode || 500);
  }
}

/** PUT /admin/stores — update one store; store_admin pinned to own scope */
async function updateStore(req, res) {
  try {
    if (!canManageWelcomeSignupBonus(req)) {
      return sendError(res, 'You do not have permission to manage welcome signup bonus settings.', 403);
    }

    const body = req.body || {};
    let scope;

    if (isMasterAdmin(req.role)) {
      const rawScope = parseStoreScopeFromBody(body);
      if (!rawScope?.storeCode) {
        return sendError(res, 'storeCode is required (and distributorCode when available).', 400);
      }
      // Validates store exists and normalizes distributor pairing
      scope = await settings.resolveStoreScope(rawScope);
    } else if (isStoreAdmin(req.role)) {
      if (req.distributorCode == null || req.storeCode == null) {
        return sendError(res, 'Store scope is required.', 403);
      }
      // Ignore any client-supplied store codes — pin to authenticated store
      scope = {
        distributorCode: req.distributorCode,
        storeCode: req.storeCode
      };
    } else {
      return sendError(res, 'Access denied.', 403);
    }

    const updatedBy = req.user?.username || req.user?.email || null;
    const updated = await settings.upsertStoreSettings(
      scope,
      {
        enabled: body.enabled,
        amountSc: body.amount_sc ?? body.amountSc,
        modalImageUrl: body.modal_image_url ?? body.modalImageUrl,
        requireDepositToActivateBonus:
          body.require_deposit_to_activate_bonus ?? body.requireDepositToActivateBonus
      },
      { updatedBy }
    );

    return sendSuccess(res, updated);
  } catch (err) {
    return sendError(res, err.message || 'Unable to update welcome signup bonus settings.', err.statusCode || 400);
  }
}

/** PUT /admin/activate-bonus-modal — toggle activate welcome/refer bonus play popup */
async function updateActivateBonusModal(req, res) {
  try {
    if (!canManageWelcomeSignupBonus(req)) {
      return sendError(res, 'You do not have permission to manage this setting.', 403);
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

    const enabled = body.require_deposit_to_activate_bonus ?? body.requireDepositToActivateBonus ?? body.enabled;
    const updatedBy = req.user?.username || req.user?.email || null;
    const updated = await settings.upsertActivateBonusModal(scope, enabled, { updatedBy });
    return sendSuccess(res, updated);
  } catch (err) {
    return sendError(res, err.message || 'Unable to update activate bonus popup setting.', err.statusCode || 400);
  }
}

/** POST /admin/modal-image-upload — upload landing welcome-bonus modal image to S3 */
async function uploadModalImage(req, res) {
  try {
    if (!canManageWelcomeSignupBonus(req)) {
      return sendError(res, 'You do not have permission to manage welcome signup bonus settings.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    assertWebpUpload(file, { maxBytes: DESKTOP_MAX_BYTES, label: 'Image' });
    const url = await uploadImageBuffer(file.buffer, {
      contentType: 'image/webp',
      keyPrefix: 'welcome-bonus'
    });
    return sendSuccess(res, { data: { url } });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  getPublic,
  listStores,
  updateStore,
  updateActivateBonusModal,
  uploadModalImage
};
