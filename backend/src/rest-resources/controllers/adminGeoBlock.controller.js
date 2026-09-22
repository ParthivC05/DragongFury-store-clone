'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  listAllStoreGeoBlockSettings,
  updateStoreGeoBlockSettings
} = require('../../services/geo/geoBlockSettings.service');

function hasAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.GEO_BLOCK);
}

function actorLabel(req) {
  const u = req.user || {};
  return String(u.username || u.email || `user:${u.userId || u.id || '?'}`).trim().slice(0, 128);
}

async function getSettings(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to geo blocking settings.', 403);
    return sendSuccess(res, await listAllStoreGeoBlockSettings());
  } catch (err) {
    return sendError(res, err.message || 'Failed to load geo blocking settings.', err.statusCode || 500);
  }
}

async function updateSettings(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to geo blocking settings.', 403);
    const body = req.body || {};
    const storeCode = body.storeCode || body.store_code;
    if (!storeCode) {
      return sendError(res, 'storeCode is required.', 400);
    }
    await updateStoreGeoBlockSettings(
      storeCode,
      { enabled: body.enabled },
      { updatedBy: actorLabel(req) }
    );
    return sendSuccess(res, await listAllStoreGeoBlockSettings());
  } catch (err) {
    return sendError(res, err.message || 'Failed to update geo blocking settings.', err.statusCode || 500);
  }
}

module.exports = {
  getSettings,
  updateSettings
};
