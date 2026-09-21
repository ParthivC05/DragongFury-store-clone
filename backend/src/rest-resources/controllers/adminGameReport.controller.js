'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { getGameReport } = require('../../services/adminGameReport/getGameReport.service');

/**
 * Super admin / technical staff always (CASINO_GAMES_REPORT, or Game Logs / Reports fallback).
 * Store admin / staff only when the permission is explicitly granted.
 */
function requireGameReportAccess(req, res) {
  if (req.role === ROLES.MASTER_ADMIN) {
    if (!canAdmin(req, ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT)) {
      return sendError(res, 'You do not have access to the Casino games report.', 403);
    }
    return null;
  }
  if (req.role === ROLES.STORE_ADMIN) {
    if (!can(req, STORE_FEATURE_KEYS.CASINO_GAMES_REPORT)) {
      return sendError(res, 'You don\'t have access to the Casino games report. Ask super admin to grant it.', 403);
    }
    if (!req.storeCode) {
      return sendError(res, 'Store scope is missing for this account. Please contact support.', 403);
    }
    return null;
  }
  return sendError(res, 'Casino games report is only available to super admin, technical staff, and granted store accounts.', 403);
}

function getGameReportParams(req) {
  const query = req.query || {};
  const scope = {};
  if (req.role === ROLES.STORE_ADMIN) {
    scope.storeCode = String(req.storeCode).trim();
  } else if (req.role === ROLES.MASTER_ADMIN) {
    if (query.storeCode) scope.storeCode = String(query.storeCode).trim();
    if (query.distributorCode) scope.distributorCode = String(query.distributorCode).trim();
  }
  return {
    req,
    scope,
    startDate: query.startDate ? String(query.startDate).trim() : null,
    endDate: query.endDate ? String(query.endDate).trim() : null,
    timezoneOffset: query.timezoneOffset,
    tab: query.tab ? String(query.tab).trim() : 'game',
    search: query.search ? String(query.search).trim() : null,
    provider: query.provider ? String(query.provider).trim() : 'all',
    page: query.page,
    limit: query.limit,
    orderBy: query.orderBy ? String(query.orderBy).trim() : 'sc_wagered',
    orderDirection: query.orderDirection ? String(query.orderDirection).trim() : 'DESC'
  };
}

/**
 * GET /api/admin/game-report
 * Aggregated SC wagered / won / GGR / payout by game, provider, or category.
 */
async function getReport(req, res) {
  try {
    const err = requireGameReportAccess(req, res);
    if (err) return err;
    const data = await getGameReport(getGameReportParams(req));
    return sendSuccess(res, data);
  } catch (e) {
    return sendError(res, e.message || 'Failed to load casino games report', 500);
  }
}

module.exports = { getReport };
