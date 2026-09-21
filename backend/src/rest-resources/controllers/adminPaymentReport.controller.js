'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getPaymentReport,
  getPaymentReportFilterOptions
} = require('../../services/adminPaymentReport/getPaymentReport.service');

/** Super admin + technical staff only (master_admin). Not store or distributor. */
function hasPaymentReportAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.PAYMENT_REPORT);
}

/**
 * GET /api/admin/payment-report/summary
 * Query: startDate?, endDate?, startTime?, endTime?, storeCode?, timezoneOffset? (Date.getTimezoneOffset()).
 * Dates/times are interpreted in the admin's local timezone when timezoneOffset is sent.
 * Returns overall summary, by-provider / by-method rates, plus game-flow
 * (purchase vs SC given, deposits/wins by 1GameHub, Bona, GitSlotPark, platform games).
 */
async function getSummary(req, res) {
  try {
    if (!hasPaymentReportAccess(req)) {
      return sendError(res, 'You do not have access to the Payment report.', 403);
    }
    const { startDate, endDate, startTime, endTime, storeCode, timezoneOffset } = req.query || {};
    const data = await getPaymentReport({
      startDate,
      endDate,
      startTime: startTime != null && String(startTime).trim() !== '' ? String(startTime).trim() : undefined,
      endTime: endTime != null && String(endTime).trim() !== '' ? String(endTime).trim() : undefined,
      storeCode: storeCode ? String(storeCode).trim() : undefined,
      timezoneOffset:
        timezoneOffset != null && String(timezoneOffset).trim() !== ''
          ? timezoneOffset
          : undefined
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load payment report', 500);
  }
}

/**
 * GET /api/admin/payment-report/filter-options
 */
async function getFilterOptions(req, res) {
  try {
    if (!hasPaymentReportAccess(req)) {
      return sendError(res, 'You do not have access to the Payment report.', 403);
    }
    const data = await getPaymentReportFilterOptions();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load payment report filters', 500);
  }
}

module.exports = {
  getSummary,
  getFilterOptions,
  hasPaymentReportAccess
};
