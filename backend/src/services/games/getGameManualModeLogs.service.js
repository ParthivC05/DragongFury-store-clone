'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { storeCodeToDisplayName } = require('./recordGameManualModeLog.service');

/**
 * Paginated manual-mode switch logs for technical staff (master_admin with admin_role_id).
 */
async function getGameManualModeLogs({
  page = 1,
  limit = 25,
  storeCode = null,
  gameId = null,
  gameName = null,
  startDate = null,
  endDate = null,
  timezoneOffset = null
} = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (safePage - 1) * safeLimit;

  const where = {};
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    where.storeCode = String(storeCode).trim();
  }
  const nameFilter = gameName != null ? String(gameName).trim() : '';
  if (nameFilter && nameFilter !== 'all') {
    where.gameName = { [Op.iLike]: nameFilter };
  } else if (gameId != null && String(gameId).trim() !== '' && String(gameId).trim() !== 'all') {
    const gid = parseInt(gameId, 10);
    if (!Number.isNaN(gid)) where.gameId = gid;
  }
  const from = toDateRangeStart(startDate, timezoneOffset);
  const to = toDateRangeEnd(endDate, timezoneOffset);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

  const { count, rows } = await db.GameManualModeLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  const list = rows.map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    const code = json.storeCode || null;
    return {
      id: json.id,
      gameId: json.gameId,
      gameName: json.gameName,
      storeCode: code,
      storeName: code ? storeCodeToDisplayName(code) : null,
      gameStoreUsername: json.gameStoreUsername,
      gameStorePassword: json.gameStorePassword,
      automationApiError: json.automationApiError,
      switchedByName: json.switchedByName,
      triggerSource: json.triggerSource,
      createdAt: json.createdAt
    };
  });

  const totalPages = Math.ceil(count / safeLimit) || 0;

  return {
    rows: list,
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages
  };
}

module.exports = { getGameManualModeLogs };
