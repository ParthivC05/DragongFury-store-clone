const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { getAnalyticsSummary, getAnalyticsTop } = require('../../services/adminAnalytics');

/**
 * Resolve userIds for current admin scope (same logic as dashboard).
 */
async function getUserIdsForScope(req) {
  const role = req.role;
  if (role === ROLES.MASTER_ADMIN) {
    const users = await db.User.findAll({
      where: { role: ROLES.USER },
      attributes: ['userId'],
      raw: true
    });
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
 * GET /api/admin/analytics/summary?startDate=&endDate=
 * Response: { totalRecharge, totalWithdraw, totalTransactions, net }
 */
async function getSummary(req, res) {
  try {
    const { startDate, endDate } = req.query || {};
    const userIds = await getUserIdsForScope(req);
    const data = await getAnalyticsSummary({
      userIds,
      startDate: startDate ? String(startDate).trim() || undefined : undefined,
      endDate: endDate ? String(endDate).trim() || undefined : undefined
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load analytics summary', 500);
  }
}

/**
 * GET /api/admin/analytics/top?startDate=&endDate=&by=store|distributor&metric=recharge
 * Response: [{ key, label, value }, ...]
 * master_admin: by=distributor returns top distributors; by=store returns top stores (platform-wide).
 * distributor_admin: by=store returns top stores in their distributor.
 * store_admin: not used (no top list at store level in plan).
 */
async function getTop(req, res) {
  try {
    const { startDate, endDate, by, metric } = req.query || {};
    const role = req.role;
    if (!by || (by !== 'distributor' && by !== 'store')) {
      return sendSuccess(res, []);
    }
    if (role === ROLES.STORE_ADMIN) {
      return sendSuccess(res, []);
    }
    const data = await getAnalyticsTop({
      role,
      distributorCode: req.distributorCode || undefined,
      startDate: startDate ? String(startDate).trim() || undefined : undefined,
      endDate: endDate ? String(endDate).trim() || undefined : undefined,
      by,
      metric: metric ? String(metric).trim() || 'recharge' : 'recharge'
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load analytics top', 500);
  }
}

module.exports = { getSummary, getTop };
