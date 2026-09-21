'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { listReferralTransactions } = require('../../services/adminReferral/listReferralTransactions.service');

function hasAccess(req) {
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.AFFILIATE);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.AFFILIATE);
  }
  return false;
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to referral transactions.', 403);
    }
    const result = await listReferralTransactions(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load referral transactions.', status);
  }
}

module.exports = {
  list
};
