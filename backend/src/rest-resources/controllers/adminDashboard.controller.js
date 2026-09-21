const db = require('../../db/models');
const { Op } = require('sequelize');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { getReportSeries } = require('../../services/adminReports');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');

function getTodayCreatedAtFilter() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    createdAt: {
      [Op.gte]: toDateRangeStart(today),
      [Op.lte]: toDateRangeEnd(today)
    }
  };
}

async function getStats(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.DASHBOARD)) return sendError(res, 'You don\'t have access to the Dashboard. Please contact your administrator if you need access.', 403);
    const role = req.role;
    const stats = {
      totalUsersCount: null,
      todayNewUsersCount: null,
      distributorsCount: null,
      storeUsersCount: null,
      totalTopupSum: null,
      totalWithdrawSum: null
    };

    if (role === ROLES.MASTER_ADMIN) {
      const userWhere = { role: ROLES.USER };
      const todayUserWhere = { ...userWhere, ...getTodayCreatedAtFilter() };
      const [totalUsersCount, todayNewUsersCount, distributorsCount, storeUsersCount, users] = await Promise.all([
        db.User.count({ where: userWhere }),
        db.User.count({ where: todayUserWhere }),
        db.User.count({ where: { role: ROLES.DISTRIBUTOR_ADMIN } }),
        db.User.count({ where: { role: ROLES.STORE_ADMIN, storeRoleId: null, deletedAt: null } }),
        db.User.findAll({ where: userWhere, attributes: ['userId'], raw: true })
      ]);
      stats.totalUsersCount = totalUsersCount;
      stats.todayNewUsersCount = todayNewUsersCount;
      stats.distributorsCount = distributorsCount;
      stats.storeUsersCount = storeUsersCount;
      const userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
      if (userIds.length > 0) {
        const [topupSum, withdrawSum] = await Promise.all([
          db.UserTransaction.sum('amount', { where: { userId: { [Op.in]: userIds }, type: 'deposit' } }),
          db.UserTransaction.sum('amount', { where: { userId: { [Op.in]: userIds }, type: 'withdraw' } })
        ]);
        stats.totalTopupSum = Number(topupSum) || 0;
        stats.totalWithdrawSum = Number(withdrawSum) || 0;
      }
    } else if (role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode) {
      const code = req.distributorCode;
      const userWhere = { distributorCode: code, role: ROLES.USER };
      const todayUserWhere = { ...userWhere, ...getTodayCreatedAtFilter() };
      const [totalUsersCount, todayNewUsersCount, storeUsersCount, users] = await Promise.all([
        db.User.count({ where: userWhere }),
        db.User.count({ where: todayUserWhere }),
        db.User.count({ where: { distributorCode: code, role: ROLES.STORE_ADMIN, storeRoleId: null, deletedAt: null } }),
        db.User.findAll({ where: userWhere, attributes: ['userId'], raw: true })
      ]);
      stats.totalUsersCount = totalUsersCount;
      stats.todayNewUsersCount = todayNewUsersCount;
      stats.storeUsersCount = storeUsersCount;
      stats.distributorsCount = null;
      const userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
      if (userIds.length > 0) {
        const [topupSum, withdrawSum] = await Promise.all([
          db.UserTransaction.sum('amount', { where: { userId: { [Op.in]: userIds }, type: 'deposit' } }),
          db.UserTransaction.sum('amount', { where: { userId: { [Op.in]: userIds }, type: 'withdraw' } })
        ]);
        stats.totalTopupSum = Number(topupSum) || 0;
        stats.totalWithdrawSum = Number(withdrawSum) || 0;
      }
    } else if (role === ROLES.STORE_ADMIN && req.distributorCode != null && req.storeCode != null) {
      const where = { distributorCode: req.distributorCode, storeCode: req.storeCode, role: ROLES.USER };
      const todayWhere = { ...where, ...getTodayCreatedAtFilter() };
      const [totalUsersCount, todayNewUsersCount, users] = await Promise.all([
        db.User.count({ where }),
        db.User.count({ where: todayWhere }),
        db.User.findAll({ where, attributes: ['userId'], raw: true })
      ]);
      stats.totalUsersCount = totalUsersCount;
      stats.todayNewUsersCount = todayNewUsersCount;
      stats.distributorsCount = null;
      stats.storeUsersCount = null;
      const userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
      if (userIds.length > 0) {
        const [topupSum, withdrawSum] = await Promise.all([
          db.UserTransaction.sum('amount', { where: { userId: { [Op.in]: userIds }, type: 'deposit' } }),
          db.UserTransaction.sum('amount', { where: { userId: { [Op.in]: userIds }, type: 'withdraw' } })
        ]);
        stats.totalTopupSum = Number(topupSum) || 0;
        stats.totalWithdrawSum = Number(withdrawSum) || 0;
      }
    }

    sendSuccess(res, stats);
  } catch (err) {
    sendError(res, err.message || 'Failed to load dashboard', 500);
  }
}

/**
 * Dashboard time-series (daily/monthly topup & withdraw) for current admin scope.
 * GET /api/admin/dashboard/series?dateFrom=...&dateTo=...&startTime=HH:mm&endTime=HH:mm&timezoneOffset=...
 */
async function getSeries(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.DASHBOARD)) return sendError(res, 'You don\'t have access to the Dashboard. Please contact your administrator if you need access.', 403);
    const role = req.role;
    const { dateFrom, dateTo, startTime, endTime, timezoneOffset } = req.query || {};
    let userIds = [];

    if (role === ROLES.MASTER_ADMIN) {
      const users = await db.User.findAll({
        where: { role: ROLES.USER },
        attributes: ['userId'],
        raw: true
      });
      userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
    } else if (role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode) {
      const users = await db.User.findAll({
        where: { distributorCode: req.distributorCode, role: ROLES.USER },
        attributes: ['userId'],
        raw: true
      });
      userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
    } else if (role === ROLES.STORE_ADMIN && req.distributorCode != null && req.storeCode != null) {
      const users = await db.User.findAll({
        where: { distributorCode: req.distributorCode, storeCode: req.storeCode, role: ROLES.USER },
        attributes: ['userId'],
        raw: true
      });
      userIds = (users || []).map((u) => u.userId).filter((id) => id != null);
    }

    // Time-of-day filter is only for store staff (storeRoleId). Store owners and other roles stay date-only.
    const isStoreStaff = role === ROLES.STORE_ADMIN && req.storeRoleId != null;
    const seriesParams = {
      userIds,
      dateFrom: dateFrom ? String(dateFrom).trim() || undefined : undefined,
      dateTo: dateTo ? String(dateTo).trim() || undefined : undefined
    };
    if (isStoreStaff) {
      seriesParams.startTime = startTime != null && String(startTime).trim() !== '' ? String(startTime).trim() : undefined;
      seriesParams.endTime = endTime != null && String(endTime).trim() !== '' ? String(endTime).trim() : undefined;
      seriesParams.timezoneOffset = timezoneOffset != null && String(timezoneOffset).trim() !== '' ? timezoneOffset : undefined;
    }

    const data = await getReportSeries(seriesParams);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load dashboard series', 500);
  }
}

module.exports = { getStats, getSeries };
