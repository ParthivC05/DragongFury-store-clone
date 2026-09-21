'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS, STORE_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getWalletScReconciliation,
  getWalletScReconciliationFilterOptions
} = require('../../services/adminWalletScReconciliation/getWalletScReconciliation.service');
const {
  getWalletScReconciliationEntries
} = require('../../services/adminWalletScReconciliation/getWalletScReconciliationEntries.service');

function hasAccess(req) {
  if (isMasterAdmin(req.role)) return canAdmin(req, ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION);
  if (isStoreAdmin(req.role)) return can(req, STORE_FEATURE_KEYS.WALLET_SC_RECONCILIATION);
  return false;
}

function scopedStoreCode(req, requested) {
  if (isStoreAdmin(req.role)) {
    const own = req.storeCode ? String(req.storeCode).trim() : '';
    return own || undefined;
  }
  return requested ? String(requested).trim() : undefined;
}

async function getSummary(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to the SC coin story page.', 403);
    }
    if (isStoreAdmin(req.role) && !scopedStoreCode(req)) {
      return sendError(res, 'Store is required.', 400);
    }
    const { startDate, endDate, timezoneOffset, storeCode, userId, username } = req.query || {};
    const data = await getWalletScReconciliation({
      startDate,
      endDate,
      timezoneOffset,
      storeCode: scopedStoreCode(req, storeCode),
      userId,
      username: username ? String(username).trim() : undefined
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load SC coin story', 500);
  }
}

async function getEntries(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to the SC coin story page.', 403);
    }
    if (isStoreAdmin(req.role) && !scopedStoreCode(req)) {
      return sendError(res, 'Store is required.', 400);
    }
    const q = req.query || {};
    const data = await getWalletScReconciliationEntries({
      startDate: q.startDate,
      endDate: q.endDate,
      timezoneOffset: q.timezoneOffset,
      storeCode: scopedStoreCode(req, q.storeCode),
      userId: q.userId,
      username: q.username ? String(q.username).trim() : undefined,
      metric: q.metric ? String(q.metric).trim() : undefined,
      productId: q.productId ? String(q.productId).trim() : undefined,
      providerId: q.providerId ? String(q.providerId).trim() : undefined,
      gameId: q.gameId,
      page: q.page,
      limit: q.limit
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load SC coin details', 500);
  }
}

async function getFilterOptions(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to the SC coin story page.', 403);
    }
    if (isStoreAdmin(req.role)) {
      const own = scopedStoreCode(req);
      return sendSuccess(res, { storeCodes: own ? [own] : [] });
    }
    const data = await getWalletScReconciliationFilterOptions();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load filters', 500);
  }
}

module.exports = {
  getSummary,
  getEntries,
  getFilterOptions,
  hasAccess
};
