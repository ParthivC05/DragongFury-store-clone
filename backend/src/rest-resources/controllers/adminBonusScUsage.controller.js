'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getBonusScUsageReport,
  getBonusScUsageFilterOptions
} = require('../../services/adminBonusScUsage/getBonusScUsageReport.service');

/** Super admin + technical staff only (master_admin). */
function hasBonusScUsageAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.BONUS_SC_USAGE);
}

/**
 * GET /api/admin/bonus-sc-usage/summary
 */
async function getSummary(req, res) {
  try {
    if (!hasBonusScUsageAccess(req)) {
      return sendError(res, 'You do not have access to the Bonus SC used & left report.', 403);
    }
    const { startDate, endDate, storeCode, page, limit } = req.query || {};
    const data = await getBonusScUsageReport({
      startDate,
      endDate,
      filterStoreCode: storeCode ? String(storeCode).trim() : undefined,
      page,
      limit
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load Bonus SC usage report', 500);
  }
}

/**
 * GET /api/admin/bonus-sc-usage/filter-options
 */
async function getFilterOptions(req, res) {
  try {
    if (!hasBonusScUsageAccess(req)) {
      return sendError(res, 'You do not have access to the Bonus SC used & left report.', 403);
    }
    const data = await getBonusScUsageFilterOptions();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load Bonus SC usage filters', 500);
  }
}

module.exports = {
  getSummary,
  getFilterOptions,
  hasBonusScUsageAccess
};
