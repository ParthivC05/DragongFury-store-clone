'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { storeCodeToDisplayName } = require('../games/recordGameManualModeLog.service');
const {
  isExcludedAutomationUsageOperation,
  excludeOperationsFromSequelizeWhere
} = require('./automationUsageFilters');
const {
  getEndpointAwareDisplayName,
  getEndpointWhereForMode,
  parseAutomationUsageGameFilter,
  gameMatchesAutomationFilter
} = require('./automationUsageGameSplit');

async function findGameIdsForAutomationFilter(gameName, storeCode = null) {
  const filter = parseAutomationUsageGameFilter(gameName);
  if (!filter) return null;

  const where = {};
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    where.addedByStoreCode = String(storeCode).trim();
  }
  const rows = await db.Game.findAll({
    where,
    attributes: ['id', 'name', 'gameKey', 'botApiKey', 'streamlitToken', 'agentId'],
    raw: true
  });
  const ids = rows
    .filter((game) => gameMatchesAutomationFilter(game, filter))
    .map((game) => game.id);
  return ids.length ? ids : [-1];
}

/**
 * Paginated list of failed third-party bot API calls.
 */
async function getAutomationUsageErrors({
  page = 1,
  limit = 25,
  startDate = null,
  endDate = null,
  gameId = null,
  gameName = null,
  storeCode = null,
  operation = null
} = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (safePage - 1) * safeLimit;

  if (!db.GameAutomationApiLog) {
    return { rows: [], total: 0, page: safePage, limit: safeLimit, totalPages: 0 };
  }

  const where = { success: false };
  if (gameName != null && String(gameName).trim() !== '' && String(gameName).trim() !== 'all') {
    const requestedName = String(gameName).trim();
    const filter = parseAutomationUsageGameFilter(requestedName);
    const gameIds = await findGameIdsForAutomationFilter(requestedName, storeCode);
    if (gameIds) {
      where.gameId = { [Op.in]: gameIds };
      const endpointWhere = getEndpointWhereForMode(filter?.mode || null);
      if (endpointWhere) where[Op.and] = [...(where[Op.and] || []), endpointWhere];
    } else {
      where.gameName = { [Op.iLike]: requestedName };
    }
  } else if (gameId != null && String(gameId).trim() !== '' && String(gameId).trim() !== 'all') {
    const gid = parseInt(gameId, 10);
    if (!Number.isNaN(gid)) where.gameId = gid;
  }
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    where.storeCode = String(storeCode).trim();
  }
  if (operation != null && String(operation).trim() !== '' && String(operation).trim() !== 'all') {
    const op = String(operation).trim();
    if (isExcludedAutomationUsageOperation(op)) {
      return { rows: [], total: 0, page: safePage, limit: safeLimit, totalPages: 0 };
    }
    where.operation = op;
  }
  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

  const { count, rows } = await db.GameAutomationApiLog.findAndCountAll({
    where: excludeOperationsFromSequelizeWhere(where),
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  const gameIds = [...new Set(rows.map((row) => Number(row.gameId ?? row.game_id)).filter(Boolean))];
  const gamesById = new Map();
  if (gameIds.length) {
    const games = await db.Game.findAll({
      where: { id: { [Op.in]: gameIds } },
      attributes: ['id', 'name', 'gameKey', 'botApiKey', 'streamlitToken', 'agentId'],
      raw: true
    });
    games.forEach((game) => gamesById.set(Number(game.id), game));
  }

  const list = rows.map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    const code = json.storeCode || null;
    const game = gamesById.get(Number(json.gameId));
    return {
      id: json.id,
      gameId: json.gameId,
      gameName: getEndpointAwareDisplayName(game, json.gameName, json.apiEndpoint),
      storeCode: code,
      storeName: code ? storeCodeToDisplayName(code) : 'Unassigned',
      gameUsername: json.gameUsername || null,
      operation: json.operation,
      apiEndpoint: json.apiEndpoint,
      httpStatus: json.httpStatus,
      errorMessage: json.errorMessage,
      createdAt: json.createdAt
    };
  });

  return {
    rows: list,
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(count / safeLimit) || 0
  };
}

module.exports = { getAutomationUsageErrors };
