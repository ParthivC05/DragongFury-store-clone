'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const adminBonusCodes = require('../../services/bonusCodes/adminBonusCodes.service');

function hasBonusAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.MASTER_ADMIN) return canAdmin(req, ADMIN_FEATURE_KEYS.BONUS_CODES);
  if (req.role === ROLES.STORE_ADMIN) return can(req, STORE_FEATURE_KEYS.BONUS_CODES);
  return false;
}

async function listCodes(req, res) {
  try {
    if (!hasBonusAccess(req)) return sendError(res, 'You do not have access to bonus codes.', 403);
    const data = await adminBonusCodes.listCodes(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list bonus codes.', err.statusCode || 500);
  }
}

async function getCode(req, res) {
  try {
    if (!hasBonusAccess(req)) return sendError(res, 'You do not have access to bonus codes.', 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminBonusCodes.getCodeById(req, id);
    return sendSuccess(res, { bonus_code: data });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function createCode(req, res) {
  try {
    if (!hasBonusAccess(req)) return sendError(res, 'You do not have access to bonus codes.', 403);
    const data = await adminBonusCodes.createCode(req, req.body || {});
    return sendSuccess(res, { bonus_code: data }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Create failed.', err.statusCode || 500);
  }
}

async function updateCode(req, res) {
  try {
    if (!hasBonusAccess(req)) return sendError(res, 'You do not have access to bonus codes.', 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminBonusCodes.updateCode(req, id, req.body || {});
    return sendSuccess(res, { bonus_code: data });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500);
  }
}

async function removeCode(req, res) {
  try {
    if (!hasBonusAccess(req)) return sendError(res, 'You do not have access to bonus codes.', 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminBonusCodes.deleteCode(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Delete failed.', err.statusCode || 500);
  }
}

async function listTransactions(req, res) {
  try {
    if (!hasBonusAccess(req)) return sendError(res, 'You do not have access to bonus transactions.', 403);
    const data = await adminBonusCodes.listTransactions(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list bonus transactions.', err.statusCode || 500);
  }
}

module.exports = {
  listCodes,
  getCode,
  createCode,
  updateCode,
  removeCode,
  listTransactions
};
