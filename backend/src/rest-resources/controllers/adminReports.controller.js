const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const {
  getReportSeries,
  getReportsSummary,
  getReportsBreakdown,
  getReportsTransactions
} = require('../../services/adminReports');
const { REPORTS_REAL_MONEY_ONLY } = require('../../services/adminReports/reportsConfig');
const { ROLES } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');

/** Reports and transactions: master_admin and distributor_admin always allowed; store_admin needs reports permission. */
function canAccessReports(req, res) {
  if (!can(req, STORE_FEATURE_KEYS.REPORTS)) {
    sendError(res, 'You don\'t have access to Reports. Please contact your administrator if you need access.', 403);
    return false;
  }
  return true;
}

/** Resolve userIds for current admin scope (same as dashboard/analytics). */
async function getUserIdsForScope(req) {
  const role = req.role;
  if (role === ROLES.MASTER_ADMIN) {
    const users = await db.User.findAll({ where: { role: ROLES.USER }, attributes: ['userId'], raw: true });
    return (users || []).map((u) => u.userId).filter((id) => id != null);
  }
  if (role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode) {
    const users = await db.User.findAll({
      where: { distributorCode: req.distributorCode, role: ROLES.USER },
      attributes: ['userId'],
      raw: true
    });
    return (users || []).map((u) => u.userId).filter((id) => id != null);
  }
  if (role === ROLES.STORE_ADMIN && req.distributorCode != null && req.storeCode != null) {
    const users = await db.User.findAll({
      where: { distributorCode: req.distributorCode, storeCode: req.storeCode, role: ROLES.USER },
      attributes: ['userId'],
      raw: true
    });
    return (users || []).map((u) => u.userId).filter((id) => id != null);
  }
  return [];
}

/**
 * Unified reports (all admin roles, scope from auth).
 * GET /api/admin/reports/summary?startDate=&endDate=&type=
 */
async function getSummary(req, res) {
  try {
    if (!canAccessReports(req, res)) return;
    const { startDate, endDate, type, timezoneOffset } = req.query || {};
    const userIds = await getUserIdsForScope(req);
    const data = await getReportsSummary({
      userIds,
      startDate: startDate ? String(startDate).trim() || undefined : undefined,
      endDate: endDate ? String(endDate).trim() || undefined : undefined,
      type: type ? String(type).trim() || undefined : undefined,
      timezoneOffset
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load report summary', 500);
  }
}

/**
 * GET /api/admin/reports/trend?startDate=&endDate=
 * Returns [{ date, rechargeAmount, withdrawAmount }] (daily).
 */
async function getTrend(req, res) {
  try {
    if (!canAccessReports(req, res)) return;
    const { startDate, endDate, timezoneOffset } = req.query || {};
    const userIds = await getUserIdsForScope(req);
    const raw = await getReportSeries({
      userIds,
      dateFrom: startDate ? String(startDate).trim() || undefined : undefined,
      dateTo: endDate ? String(endDate).trim() || undefined : undefined,
      timezoneOffset
    });
    const topupByDate = Object.fromEntries((raw.dailyTopup || []).map((r) => [r.date, Number(r.sum) || 0]));
    const withdrawByDate = Object.fromEntries((raw.dailyWithdraw || []).map((r) => [r.date, Number(r.sum) || 0]));
    let dates = [...new Set([...(raw.dailyTopup || []).map((r) => r.date), ...(raw.dailyWithdraw || []).map((r) => r.date)])].sort();
    if (startDate && endDate) {
      const from = new Date(startDate);
      const to = new Date(endDate);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
        const all = [];
        const d = new Date(from);
        while (d <= to) {
          all.push(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 1);
        }
        dates = all;
      }
    }
    const data = dates.map((date) => ({
      date,
      rechargeAmount: topupByDate[date] ?? 0,
      withdrawAmount: withdrawByDate[date] ?? 0
    }));
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load report trend', 500);
  }
}

/**
 * GET /api/admin/reports/breakdown?startDate=&endDate=
 */
async function getBreakdown(req, res) {
  try {
    if (!canAccessReports(req, res)) return;
    const { startDate, endDate, timezoneOffset } = req.query || {};
    const userIds = await getUserIdsForScope(req);
    const data = await getReportsBreakdown({
      userIds,
      startDate: startDate ? String(startDate).trim() || undefined : undefined,
      endDate: endDate ? String(endDate).trim() || undefined : undefined,
      timezoneOffset
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load report breakdown', 500);
  }
}

/**
 * GET /api/admin/reports/filter-options
 * Returns { distributorCodes, storeCodes, realMoneyOnly } for transaction filters.
 * When realMoneyOnly is true, admin panel should only show Topup and Withdraw (no spin wheel, game, promotions, VIP, etc.).
 */
async function getFilterOptions(req, res) {
  try {
    if (!canAccessReports(req, res)) return;
    const role = req.role;
    let distributorCodes = [];
    let storeCodes = [];

    if (role === ROLES.MASTER_ADMIN) {
      const distRows = await db.User.findAll({
        where: { role: ROLES.DISTRIBUTOR_ADMIN, isActive: true },
        attributes: ['distributorCode'],
        raw: true
      });
      distributorCodes = [...new Set((distRows || []).map((r) => r.distributorCode).filter(Boolean))].sort();
      const storeRows = await db.User.findAll({
        where: { role: ROLES.STORE_ADMIN },
        attributes: ['storeCode'],
        raw: true
      });
      storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();
    } else if (role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode) {
      distributorCodes = [req.distributorCode];
      const storeRows = await db.User.findAll({
        where: { role: ROLES.STORE_ADMIN, distributorCode: req.distributorCode },
        attributes: ['storeCode'],
        raw: true
      });
      storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();
    }

    sendSuccess(res, { distributorCodes, storeCodes, realMoneyOnly: REPORTS_REAL_MONEY_ONLY });
  } catch (err) {
    sendError(res, err.message || 'Failed to load filter options', 500);
  }
}

/**
 * GET /api/admin/reports/transactions?startDate=&endDate=&type=&distributorCode=&storeCode=&page=&limit=&sortBy=&sortOrder=
 * type: comma-separated. distributorCode and storeCode: comma-separated for multi-select.
 */
async function getTransactions(req, res) {
  try {
    if (!canAccessReports(req, res)) return;
    const { startDate, endDate, timezoneOffset, type, distributorCode, storeCode, page, limit, sortBy, sortOrder } = req.query || {};
    const userIds = await getUserIdsForScope(req);
    let typeParam = type != null ? (Array.isArray(type) ? type.join(',') : String(type).trim()) || undefined : undefined;
    let distParam = distributorCode != null ? (Array.isArray(distributorCode) ? distributorCode.join(',') : String(distributorCode).trim()) || undefined : undefined;
    let storeParam = storeCode != null ? (Array.isArray(storeCode) ? storeCode.join(',') : String(storeCode).trim()) || undefined : undefined;
    if (typeParam === 'undefined' || typeParam === '') typeParam = undefined;
    if (distParam === 'undefined' || distParam === '') distParam = undefined;
    if (storeParam === 'undefined' || storeParam === '') storeParam = undefined;
    const startParam = startDate != null ? String(startDate).trim() : undefined;
    const endParam = endDate != null ? String(endDate).trim() : undefined;
    const data = await getReportsTransactions({
      userIds,
      startDate: startParam && startParam !== 'undefined' ? startParam : undefined,
      endDate: endParam && endParam !== 'undefined' ? endParam : undefined,
      timezoneOffset,
      type: typeParam || undefined,
      distributorCode: distParam || undefined,
      storeCode: storeParam || undefined,
      page,
      limit,
      sortBy: sortBy ? String(sortBy).trim() || undefined : undefined,
      sortOrder: sortOrder ? String(sortOrder).trim() || undefined : undefined
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load report transactions', 500);
  }
}

module.exports = {
  getSummary,
  getTrend,
  getBreakdown,
  getFilterOptions,
  getTransactions
};
