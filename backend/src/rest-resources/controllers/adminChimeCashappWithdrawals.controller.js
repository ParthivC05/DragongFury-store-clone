'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { approveChimeCashappWithdrawalRequest } = require('../../services/wallet/approveChimeCashappWithdrawalRequest.service');
const { rejectChimeCashappWithdrawalRequest } = require('../../services/wallet/rejectChimeCashappWithdrawalRequest.service');
const {
  listChimeCashappWithdrawalRequestsAdmin,
  getChimeCashappWithdrawalRequestAdmin,
  getChimeCashappWithdrawalAccountTotalsAdmin
} = require('../../services/wallet/listChimeCashappWithdrawalRequests.service');

function hasAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS);
  }
  return false;
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime / Cash App withdrawals.', 403);
    }
    const result = await listChimeCashappWithdrawalRequestsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load requests.', status);
  }
}

function hasAccountTotalsAccess(req) {
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS);
  }
  return false;
}

async function accountTotals(req, res) {
  try {
    if (!hasAccountTotalsAccess(req)) {
      return sendError(res, 'You do not have access to withdrawal account totals.', 403);
    }
    const result = await getChimeCashappWithdrawalAccountTotalsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load account totals.', status);
  }
}

async function getOne(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime / Cash App withdrawals.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const row = await getChimeCashappWithdrawalRequestAdmin(id, req);
    return sendSuccess(res, { data: row });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Not found.', status);
  }
}

async function approve(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime / Cash App withdrawals.', 403);
    }
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const paidFromTag = req.body?.paidFromTag ?? req.body?.paid_from_tag ?? '';
    const result = await approveChimeCashappWithdrawalRequest(id, userId, req, { paidFromTag });
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Approve failed.', status);
  }
}

async function reject(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime / Cash App withdrawals.', 403);
    }
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const reason = req.body?.rejectionReason ?? req.body?.rejection_reason ?? '';
    const result = await rejectChimeCashappWithdrawalRequest(id, userId, req, reason);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Reject failed.', status);
  }
}

module.exports = {
  list,
  accountTotals,
  getOne,
  approve,
  reject
};
