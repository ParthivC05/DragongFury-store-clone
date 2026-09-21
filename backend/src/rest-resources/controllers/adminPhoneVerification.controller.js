'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getPhoneSettingsAdminView,
  updateStorePhoneSettings
} = require('../../services/phone/phoneSettings.service');

function hasAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.PHONE_VERIFICATION);
}

function actorLabel(req) {
  const u = req.user || {};
  return String(u.username || u.email || `user:${u.userId || u.id || '?'}`).trim().slice(0, 128);
}

async function getSettings(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Phone verification settings.', 403);
    }
    return sendSuccess(res, await getPhoneSettingsAdminView());
  } catch (err) {
    return sendError(res, err.message || 'Failed to load phone verification settings.', err.statusCode || 500);
  }
}

async function updateSettings(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Phone verification settings.', 403);
    }
    const body = req.body || {};
    const storeCode = body.storeCode || body.store_code;
    if (!storeCode) {
      return sendError(res, 'storeCode is required.', 400);
    }
    await updateStorePhoneSettings(
      storeCode,
      { enabled: body.enabled },
      { updatedBy: actorLabel(req) }
    );
    return sendSuccess(res, await getPhoneSettingsAdminView());
  } catch (err) {
    return sendError(
      res,
      err.message || 'Failed to update phone verification settings.',
      err.statusCode || 500
    );
  }
}

module.exports = {
  getSettings,
  updateSettings
};
