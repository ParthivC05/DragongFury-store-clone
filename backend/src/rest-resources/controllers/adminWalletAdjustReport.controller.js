'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  resolveUserIds,
  findHandlerIdsBySearch,
  getWalletAdjustReportSummary,
  getWalletAdjustReportTransactions,
  getWalletAdjustReportFilterOptions
} = require('../../services/adminWalletAdjustReport/getWalletAdjustReport.service');

/** Super admin + technical staff only (master_admin). Not store or distributor. */
function hasWalletAdjustReportAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT);
}

async function resolveHandlerFilter(handlerSearch) {
  const term = handlerSearch != null ? String(handlerSearch).trim() : '';
  if (!term) return null;
  return findHandlerIdsBySearch(term);
}

/**
 * GET /api/admin/wallet-adjust-report/summary
 */
async function getSummary(req, res) {
  try {
    if (!hasWalletAdjustReportAccess(req)) {
      return sendError(res, 'You do not have access to the Wallet adjust report.', 403);
    }
    const { startDate, endDate, timezoneOffset, type, wallet, storeCode, handlerSearch } = req.query || {};
    const userIds = await resolveUserIds({
      filterStoreCode: storeCode ? String(storeCode).trim() : undefined
    });
    const handlerUserIds = await resolveHandlerFilter(handlerSearch);
    if (handlerUserIds && handlerUserIds.length === 0) {
      return sendSuccess(res, await getWalletAdjustReportSummary({
        userIds: [],
        startDate,
        endDate,
        timezoneOffset,
        type,
        wallet,
        handlerUserIds: []
      }));
    }
    const data = await getWalletAdjustReportSummary({
      userIds,
      startDate,
      endDate,
      timezoneOffset,
      type,
      wallet,
      handlerUserIds
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load wallet adjust report summary', 500);
  }
}

/**
 * GET /api/admin/wallet-adjust-report/transactions
 */
async function getTransactions(req, res) {
  try {
    if (!hasWalletAdjustReportAccess(req)) {
      return sendError(res, 'You do not have access to the Wallet adjust report.', 403);
    }
    const {
      startDate,
      endDate,
      timezoneOffset,
      type,
      wallet,
      storeCode,
      search,
      handlerSearch,
      page,
      limit
    } = req.query || {};
    const userIds = await resolveUserIds({
      filterStoreCode: storeCode ? String(storeCode).trim() : undefined
    });
    const data = await getWalletAdjustReportTransactions({
      userIds,
      startDate,
      endDate,
      timezoneOffset,
      type,
      wallet,
      search,
      handlerSearch,
      page,
      limit
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load wallet adjust report transactions', 500);
  }
}

/**
 * GET /api/admin/wallet-adjust-report/filter-options
 */
async function getFilterOptions(req, res) {
  try {
    if (!hasWalletAdjustReportAccess(req)) {
      return sendError(res, 'You do not have access to the Wallet adjust report.', 403);
    }
    const data = await getWalletAdjustReportFilterOptions();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load wallet adjust report filters', 500);
  }
}

module.exports = {
  getSummary,
  getTransactions,
  getFilterOptions,
  hasWalletAdjustReportAccess
};
