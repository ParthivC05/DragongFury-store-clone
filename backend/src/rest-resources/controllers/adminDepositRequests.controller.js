'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  listDepositRequestsAdmin,
  listPaymentTotalsStoreCodesAdmin
} = require('../../services/wallet/listDepositRequestsAdmin.service');

function hasAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.USER_DEPOSITS) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.USER_DEPOSITS) ||
      can(req, STORE_FEATURE_KEYS.PAYMENT_TOTALS);
  }
  return false;
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to deposit history.', 403);
    }
    const result = await listDepositRequestsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load deposits.', status);
  }
}

/** Distinct store codes for dashboard payment totals (master_admin + payment providers access only). */
async function listStoreCodes(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to deposit history.', 403);
    }
    if (req.role !== ROLES.MASTER_ADMIN) {
      return sendError(res, 'Forbidden.', 403);
    }
    const storeCodes = await listPaymentTotalsStoreCodesAdmin();
    return sendSuccess(res, { storeCodes });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load store codes.', status);
  }
}

module.exports = {
  list,
  listStoreCodes
};
