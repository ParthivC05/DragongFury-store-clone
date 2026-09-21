'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const ipAllowlist = require('../../services/geo/ipAllowlist.service');

function hasAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.MASTER_ADMIN) return canAdmin(req, ADMIN_FEATURE_KEYS.GEO_IP_ALLOWLIST);
  if (req.role === ROLES.STORE_ADMIN) return can(req, STORE_FEATURE_KEYS.GEO_IP_ALLOWLIST);
  return false;
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to the geo IP allowlist.', 403);
    const data = await ipAllowlist.listEntries(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list IP allowlist.', err.statusCode || 500);
  }
}

async function create(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to the geo IP allowlist.', 403);
    const data = await ipAllowlist.createEntry(req, req.body || {});
    return sendSuccess(res, { entry: data }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Failed to add IP.', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to the geo IP allowlist.', 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await ipAllowlist.deleteEntry(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to delete IP.', err.statusCode || 500);
  }
}

module.exports = {
  list,
  create,
  remove
};
