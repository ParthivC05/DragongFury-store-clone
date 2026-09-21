'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { listWithdrawalRequestsAdmin } = require('../../services/wallet/listWithdrawalRequestsAdmin.service');

function hasAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    const pay = canAdmin(req, ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS);
    const chime = canAdmin(req, ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS);
    const totals = canAdmin(req, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS);
    return pay || chime || totals;
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const pay = can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS);
    const chime = can(req, STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS);
    const totals = can(req, STORE_FEATURE_KEYS.PAYMENT_TOTALS);
    return pay || chime || totals;
  }
  return false;
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to withdrawal history.', 403);
    }
    const result = await listWithdrawalRequestsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load withdrawals.', status);
  }
}

module.exports = { list };
