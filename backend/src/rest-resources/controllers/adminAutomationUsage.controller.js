'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { isMasterAdmin } = require('../../constants/roles');
const { getAutomationUsageGames } = require('../../services/adminAutomationUsage/getAutomationUsageGames.service');
const { getAutomationUsageTrend } = require('../../services/adminAutomationUsage/getAutomationUsageTrend.service');
const { getAutomationUsageErrors } = require('../../services/adminAutomationUsage/getAutomationUsageErrors.service');
const { getAutomationUsageBreakdown } = require('../../services/adminAutomationUsage/getAutomationUsageBreakdown.service');

function canViewAutomationUsage(req) {
  if (!isMasterAdmin(req.role)) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.AUTOMATION_USAGE) || canAdmin(req, ADMIN_FEATURE_KEYS.GAMES);
}

async function listGames(req, res) {
  try {
    if (!canViewAutomationUsage(req)) {
      return sendError(res, 'Only platform super admin or technical staff can view automation usage.', 403);
    }
    const data = await getAutomationUsageGames({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      storeCode: req.query.storeCode
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load automation games', err.statusCode || 500);
  }
}

async function getBreakdown(req, res) {
  try {
    if (!canViewAutomationUsage(req)) {
      return sendError(res, 'Only platform super admin or technical staff can view automation usage.', 403);
    }
    const data = await getAutomationUsageBreakdown({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      gameName: req.query.gameName,
      storeCode: req.query.storeCode
    });
    sendSuccess(res, { breakdown: data });
  } catch (err) {
    sendError(res, err.message || 'Failed to load automation usage breakdown', err.statusCode || 500);
  }
}

async function getTrend(req, res) {
  try {
    if (!canViewAutomationUsage(req)) {
      return sendError(res, 'Only platform super admin or technical staff can view automation usage.', 403);
    }
    const data = await getAutomationUsageTrend({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      gameId: req.query.gameId,
      gameName: req.query.gameName,
      storeCode: req.query.storeCode
    });
    sendSuccess(res, { trend: data });
  } catch (err) {
    sendError(res, err.message || 'Failed to load automation usage trend', err.statusCode || 500);
  }
}

async function listErrors(req, res) {
  try {
    if (!canViewAutomationUsage(req)) {
      return sendError(res, 'Only platform super admin or technical staff can view automation usage.', 403);
    }
    const data = await getAutomationUsageErrors({
      page: req.query.page,
      limit: req.query.limit,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      gameId: req.query.gameId,
      gameName: req.query.gameName,
      storeCode: req.query.storeCode,
      operation: req.query.operation
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load automation API errors', err.statusCode || 500);
  }
}

module.exports = {
  listGames,
  getBreakdown,
  getTrend,
  listErrors
};
