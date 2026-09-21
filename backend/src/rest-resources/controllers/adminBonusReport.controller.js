'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  resolveUserIds,
  getBonusReportSummary,
  getBonusReportTransactions,
  BONUS_TX_TYPES,
  BONUS_TYPE_LABELS,
  BONUS_TYPE_HINTS
} = require('../../services/adminBonusReport/getBonusReport.service');

/** Super admin + technical staff only (master_admin). Not store or distributor. */
function hasBonusReportAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.BONUS_REPORT);
}

/**
 * GET /api/admin/bonus-report/summary
 */
async function getSummary(req, res) {
  try {
    if (!hasBonusReportAccess(req)) {
      return sendError(res, 'You do not have access to the Bonus report.', 403);
    }
    const { startDate, endDate, timezoneOffset, type, storeCode } = req.query || {};
    const userIds = await resolveUserIds({
      role: req.role,
      distributorCode: req.distributorCode,
      storeCode: req.storeCode,
      filterStoreCode: storeCode ? String(storeCode).trim() : undefined
    });
    const data = await getBonusReportSummary({
      userIds,
      startDate,
      endDate,
      timezoneOffset,
      type
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load bonus report summary', 500);
  }
}

/**
 * GET /api/admin/bonus-report/transactions
 */
async function getTransactions(req, res) {
  try {
    if (!hasBonusReportAccess(req)) {
      return sendError(res, 'You do not have access to the Bonus report.', 403);
    }
    const { startDate, endDate, timezoneOffset, type, storeCode, search, page, limit } = req.query || {};
    const userIds = await resolveUserIds({
      role: req.role,
      distributorCode: req.distributorCode,
      storeCode: req.storeCode,
      filterStoreCode: storeCode ? String(storeCode).trim() : undefined
    });
    const data = await getBonusReportTransactions({
      userIds,
      startDate,
      endDate,
      timezoneOffset,
      type,
      search,
      page,
      limit
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load bonus report transactions', 500);
  }
}

/**
 * GET /api/admin/bonus-report/filter-options
 */
async function getFilterOptions(req, res) {
  try {
    if (!hasBonusReportAccess(req)) {
      return sendError(res, 'You do not have access to the Bonus report.', 403);
    }

    const typeOptions = BONUS_TX_TYPES.map((t) => ({
      value: t,
      label: BONUS_TYPE_LABELS[t] || t,
      hint: BONUS_TYPE_HINTS[t] || ''
    }));

    const storeRows = await db.User.findAll({
      where: { role: ROLES.STORE_ADMIN },
      attributes: ['storeCode'],
      raw: true
    });
    const storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();

    return sendSuccess(res, { typeOptions, storeCodes });
  } catch (err) {
    return sendError(res, err.message || 'Failed to load bonus report filters', 500);
  }
}

module.exports = {
  getSummary,
  getTransactions,
  getFilterOptions,
  hasBonusReportAccess
};
