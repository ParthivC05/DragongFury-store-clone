'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { listDirectCryptoTreasuryAdmin } = require('../../services/wallet/listDirectCryptoTreasuryAdmin.service');

function hasAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.USER_DEPOSITS) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.USER_DEPOSITS) ||
      can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS);
  }
  return false;
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have permission to view Direct Crypto treasury.', 403);
    }
    const result = await listDirectCryptoTreasuryAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load Direct Crypto treasury.', err.statusCode || 500);
  }
}

module.exports = { list };
