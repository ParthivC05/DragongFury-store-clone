'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS, STORE_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getDailyScReport,
  getDailyScReportFilterOptions
} = require('../../services/adminDailyScReport/getDailyScReport.service');
const {
  getDailyScReportEntries
} = require('../../services/adminDailyScReport/getDailyScReportEntries.service');

function hasAccess(req) {
  if (isMasterAdmin(req.role)) return canAdmin(req, ADMIN_FEATURE_KEYS.DAILY_SC_REPORT);
  if (isStoreAdmin(req.role)) return can(req, STORE_FEATURE_KEYS.DAILY_SC_REPORT);
  return false;
}

function scopedStoreCode(req, requested) {
  if (isStoreAdmin(req.role)) {
    const own = req.storeCode ? String(req.storeCode).trim() : '';
    return own || undefined;
  }
  return requested ? String(requested).trim() : undefined;
}

function deny(res) {
  return sendError(res, 'You do not have access to the Daily SC report.', 403);
}

async function getSummary(req, res) {
  try {
    if (!hasAccess(req)) return deny(res);
    if (isStoreAdmin(req.role) && !scopedStoreCode(req)) {
      return sendError(res, 'Store is required.', 400);
    }
    const { startDate, endDate, timezoneOffset, storeCode } = req.query || {};
    const data = await getDailyScReport({
      startDate,
      endDate,
      timezoneOffset,
      storeCode: scopedStoreCode(req, storeCode)
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load Daily SC report', err.statusCode || 500);
  }
}

async function getEntries(req, res) {
  try {
    if (!hasAccess(req)) return deny(res);
    if (isStoreAdmin(req.role) && !scopedStoreCode(req)) {
      return sendError(res, 'Store is required.', 400);
    }
    const q = req.query || {};
    const data = await getDailyScReportEntries({
      startDate: q.startDate,
      endDate: q.endDate,
      timezoneOffset: q.timezoneOffset,
      storeCode: scopedStoreCode(req, q.storeCode),
      metric: q.metric ? String(q.metric).trim() : undefined,
      productId: q.productId ? String(q.productId).trim() : undefined,
      providerId: q.providerId ? String(q.providerId).trim() : undefined,
      gameId: q.gameId,
      page: q.page,
      limit: q.limit
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load Daily SC details', err.statusCode || 500);
  }
}

async function getFilterOptions(req, res) {
  try {
    if (!hasAccess(req)) return deny(res);
    if (isStoreAdmin(req.role)) {
      const own = scopedStoreCode(req);
      return sendSuccess(res, { storeCodes: own ? [own] : [] });
    }
    const data = await getDailyScReportFilterOptions();
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
