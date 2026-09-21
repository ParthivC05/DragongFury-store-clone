'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getKycSettingsAdminView,
  updateStoreKycSettings
} = require('../../services/kyc/kycSettings.service');
const {
  getKycReports,
  getKycReportsSummary,
  getKycReportsFilterOptions
} = require('../../services/kyc/kycReports.service');

function hasAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.DIDIT_KYC);
}

function actorLabel(req) {
  const u = req.user || {};
  return String(u.username || u.email || `user:${u.userId || u.id || '?'}`).trim().slice(0, 128);
}

async function getSettings(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to KYC Config settings.', 403);
    return sendSuccess(res, await getKycSettingsAdminView());
  } catch (err) {
    return sendError(res, err.message || 'Failed to load KYC settings.', err.statusCode || 500);
  }
}

async function updateSettings(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to KYC Config settings.', 403);
    const body = req.body || {};
    const storeCode = body.storeCode || body.store_code;
    if (!storeCode) {
      return sendError(res, 'storeCode is required.', 400);
    }
    await updateStoreKycSettings(
      storeCode,
      { enabled: body.enabled },
      { updatedBy: actorLabel(req) }
    );
    return sendSuccess(res, await getKycSettingsAdminView());
  } catch (err) {
    return sendError(res, err.message || 'Failed to update KYC settings.', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/didit-kyc/reports
 */
async function getReports(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to KYC reports.', 403);
    const { storeCode, status, search, startDate, endDate, page, limit } = req.query || {};
    const data = await getKycReports({
      storeCode,
      status,
      search,
      startDate,
      endDate,
      page,
      limit
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load KYC reports.', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/didit-kyc/reports/summary
 */
async function getReportsSummary(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to KYC reports.', 403);
    const { storeCode, status, search, startDate, endDate } = req.query || {};
    const data = await getKycReportsSummary({
      storeCode,
      status,
      search,
      startDate,
      endDate
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load KYC report summary.', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/didit-kyc/reports/filter-options
 */
async function getReportsFilterOptions(req, res) {
  try {
    if (!hasAccess(req)) return sendError(res, 'You do not have access to KYC reports.', 403);
    return sendSuccess(res, await getKycReportsFilterOptions());
  } catch (err) {
    return sendError(res, err.message || 'Failed to load KYC report filters.', err.statusCode || 500);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getReports,
  getReportsSummary,
  getReportsFilterOptions
};
