'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const {
  getGameLogsStats,
  getGameLogsSignups,
  getGameLogsDeposits,
  getGameLogsWithdrawals,
  getGameLogsTrend,
  getGameLogsBreakdown,
  getGameLogsTransactions
} = require('../../services/adminGameLogs');

/**
 * Game Logs + Slots Transactions: master_admin, distributor_admin, store_admin (with permission).
 * Scope: store_admin → own store; distributor_admin → own distributor; master_admin → all (optional filters).
 */
function requireGameLogsAccess(req, res) {
  if (req.role !== ROLES.MASTER_ADMIN && req.role !== ROLES.DISTRIBUTOR_ADMIN && req.role !== ROLES.STORE_ADMIN) {
    return sendError(res, 'Game logs are only available to super admin, distributor admin, and store administrators.', 403);
  }
  if (req.role === ROLES.STORE_ADMIN && !can(req, STORE_FEATURE_KEYS.GAME_LOGS)) {
    return sendError(res, 'You don\'t have access to game logs. Please contact your administrator if you need access.', 403);
  }
  // Fail closed: never return unscoped data if identity is missing.
  if (req.role === ROLES.STORE_ADMIN && !req.storeCode) {
    return sendError(res, 'Store scope is missing for this account. Please contact support.', 403);
  }
  if (req.role === ROLES.DISTRIBUTOR_ADMIN && !req.distributorCode) {
    return sendError(res, 'Distributor scope is missing for this account. Please contact support.', 403);
  }
  return null;
}

/**
 * Build scope and date range from request for game logs queries.
 * Store admin / staff: forced to their own store (query storeCode ignored).
 * Distributor: forced to their distributor (query storeCode ignored).
 * Master / technical staff: optional storeCode / distributorCode filters.
 */
function getGameLogsParams(req) {
  const query = req.query || {};
  const scope = {};
  if (req.role === ROLES.STORE_ADMIN) {
    // Never trust client storeCode — store staff cannot view other stores.
    scope.storeCode = String(req.storeCode).trim();
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    scope.distributorCode = String(req.distributorCode).trim();
  } else if (req.role === ROLES.MASTER_ADMIN) {
    if (query.storeCode) scope.storeCode = String(query.storeCode).trim();
    if (query.distributorCode) scope.distributorCode = String(query.distributorCode).trim();
  }
  return {
    scope,
    startDate: query.startDate ? String(query.startDate).trim() : null,
    endDate: query.endDate ? String(query.endDate).trim() : null,
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    type: query.type ? String(query.type).trim() : 'all',
    username: query.username ? String(query.username).trim() : null,
    gameName: query.gameName ? String(query.gameName).trim() : null,
    status: query.status ? String(query.status).trim() : 'all',
    provider: query.provider ? String(query.provider).trim() : 'all',
    viewerRole: req.role
  };
}

async function getStats(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const { scope, startDate, endDate } = getGameLogsParams(req);
    const data = await getGameLogsStats({ scope, startDate, endDate });
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load game logs stats', 500);
  }
}

async function getSignups(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const params = getGameLogsParams(req);
    const data = await getGameLogsSignups(params);
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load signups', 500);
  }
}

async function getDeposits(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const params = getGameLogsParams(req);
    const data = await getGameLogsDeposits(params);
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load game deposits', 500);
  }
}

async function getWithdrawals(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const params = getGameLogsParams(req);
    const data = await getGameLogsWithdrawals(params);
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load game withdrawals', 500);
  }
}

async function getTrend(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const { scope, startDate, endDate } = getGameLogsParams(req);
    const data = await getGameLogsTrend({ scope, startDate, endDate });
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load game logs trend', 500);
  }
}

async function getBreakdown(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const { scope, startDate, endDate } = getGameLogsParams(req);
    const data = await getGameLogsBreakdown({ scope, startDate, endDate });
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load game logs breakdown', 500);
  }
}

async function getTransactions(req, res) {
  try {
    const err = requireGameLogsAccess(req, res);
    if (err) return err;
    const params = getGameLogsParams(req);
    const data = await getGameLogsTransactions({ ...params, req });
    sendSuccess(res, data);
  } catch (e) {
    sendError(res, e.message || 'Failed to load slots transactions', 500);
  }
}

module.exports = {
  getStats,
  getSignups,
  getDeposits,
  getWithdrawals,
  getTrend,
  getBreakdown,
  getTransactions
};
