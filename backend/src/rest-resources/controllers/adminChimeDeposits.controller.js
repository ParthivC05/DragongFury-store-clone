'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { approveChimeDepositRequest } = require('../../services/wallet/approveChimeDepositRequest.service');
const { rejectChimeDepositRequest } = require('../../services/wallet/rejectChimeDepositRequest.service');
const {
  listChimeDepositRequestsAdmin,
  getChimeDepositRequestAdmin,
  getChimeDepositAccountTotalsAdmin
} = require('../../services/wallet/listChimeDepositRequests.service');
const {
  getReceiveAccounts,
  setReceiveAccounts
} = require('../../services/wallet/storeChimeDepositReceiveAccounts.service');
const { uploadImageBuffer } = require('../../utils/s3Upload');

function hasAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.CHIME_DEPOSITS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.CHIME_DEPOSITS);
  }
  return false;
}

/** Account totals tab: super admin / technical staff, or store staff explicitly granted. */
function hasAccountTotalsAccess(req) {
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS);
  }
  return false;
}

/** Pay-to Chime accounts (cashtags / QR). Prefer chime_accounts; fall back to chime_deposits for older roles. */
function hasPayToAccountsAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.CHIME_ACCOUNTS);
  }
  return false;
}

/** Store admin: own store. Master/distributor: pass storeCode + distributorCode (query for GET, body for PUT). */
function resolveReceiveAccountsScope(req) {
  if (req.role === ROLES.STORE_ADMIN) {
    const dc = req.distributorCode ? String(req.distributorCode).trim() : null;
    const sc = req.storeCode ? String(req.storeCode).trim() : null;
    if (!dc || !sc) {
      const err = new Error('Store context is missing.');
      err.statusCode = 400;
      throw err;
    }
    return { distributorCode: dc, storeCode: sc };
  }
  const q = req.query || {};
  const b = req.body || {};
  const storeCode = String(q.storeCode ?? b.storeCode ?? '').trim();
  const distributorCode = String(q.distributorCode ?? b.distributorCode ?? '').trim();
  if (!storeCode || !distributorCode) {
    const err = new Error('storeCode and distributorCode are required.');
    err.statusCode = 400;
    throw err;
  }
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    const selfDc = req.distributorCode ? String(req.distributorCode).trim() : '';
    if (selfDc && distributorCode !== selfDc) {
      const err = new Error('You can only manage stores in your distributor.');
      err.statusCode = 403;
      throw err;
    }
  }
  return { distributorCode: distributorCode.slice(0, 64), storeCode: storeCode.slice(0, 64) };
}

async function getReceiveAccountsHandler(req, res) {
  try {
    if (!hasPayToAccountsAccess(req)) {
      return sendError(res, 'You do not have permission to manage pay-to Chime accounts.', 403);
    }
    const { distributorCode, storeCode } = resolveReceiveAccountsScope(req);
    const accounts = await getReceiveAccounts(distributorCode, storeCode);
    // `usernames` kept for backward compatibility with older clients.
    const usernames = accounts.map((a) => a.username);
    return sendSuccess(res, { data: { accounts, usernames, storeCode, distributorCode } });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load.', status);
  }
}

async function updateReceiveAccounts(req, res) {
  try {
    if (!hasPayToAccountsAccess(req)) {
      return sendError(res, 'You do not have permission to manage pay-to Chime accounts.', 403);
    }
    const { distributorCode, storeCode } = resolveReceiveAccountsScope(req);
    // Prefer the new `accounts` object list; fall back to legacy `usernames` string list.
    const raw = Array.isArray(req.body?.accounts)
      ? req.body.accounts
      : (req.body?.usernames ?? req.body?.receiveUsernames);
    const accounts = await setReceiveAccounts(distributorCode, storeCode, raw);
    const usernames = accounts.map((a) => a.username);
    return sendSuccess(res, { data: { accounts, usernames, storeCode, distributorCode } });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to save.', status);
  }
}

/** Upload a Chime pay-to QR image to S3 and return its public URL. */
async function uploadQr(req, res) {
  try {
    if (!hasPayToAccountsAccess(req)) {
      return sendError(res, 'You do not have permission to manage pay-to Chime accounts.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const url = await uploadImageBuffer(file.buffer, {
      contentType: file.mimetype,
      keyPrefix: 'chime-qr'
    });
    return sendSuccess(res, { data: { url } });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Upload failed.', status);
  }
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime deposits.', 403);
    }
    const result = await listChimeDepositRequestsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load requests.', status);
  }
}

async function accountTotals(req, res) {
  try {
    if (!hasAccountTotalsAccess(req)) {
      return sendError(res, 'You do not have access to Chime deposit account totals.', 403);
    }
    const result = await getChimeDepositAccountTotalsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load account totals.', status);
  }
}

async function getOne(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime deposits.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const row = await getChimeDepositRequestAdmin(id, req);
    return sendSuccess(res, { data: row });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Not found.', status);
  }
}

async function approve(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime deposits.', 403);
    }
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const result = await approveChimeDepositRequest(id, userId, req);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Approve failed.', status);
  }
}

async function reject(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to Chime deposits.', 403);
    }
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const reason = req.body?.rejectionReason ?? req.body?.rejection_reason ?? '';
    const result = await rejectChimeDepositRequest(id, userId, req, reason);
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
  reject,
  getReceiveAccounts: getReceiveAccountsHandler,
  updateReceiveAccounts,
  uploadQr
};
