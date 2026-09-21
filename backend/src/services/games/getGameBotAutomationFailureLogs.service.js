'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { storeCodeToDisplayName } = require('./recordGameManualModeLog.service');

/** Same operations as the 3-error manual mode rule (deposit, redeem, register). */
const MANUAL_MODE_THRESHOLD_OPERATION_TYPES = ['topup', 'redeem', 'register'];
const BOT_AUTOMATION_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeStoreCode(storeCode) {
  if (storeCode == null) return '';
  const s = String(storeCode).trim();
  return s || '';
}

function gameStoreKey(gameId, storeCode) {
  return `${gameId}::${normalizeStoreCode(storeCode)}`;
}

function computeDistinctUserSequence(groupLogs, targetRow) {
  const windowStart = new Date(new Date(targetRow.createdAt).getTime() - BOT_AUTOMATION_FAILURE_WINDOW_MS);
  const targetTime = new Date(targetRow.createdAt);
  const inWindow = groupLogs.filter((log) => {
    const t = new Date(log.createdAt);
    return t >= windowStart && t <= targetTime;
  });
  const distinctOrder = [];
  for (const log of inWindow) {
    if (!distinctOrder.includes(log.platformUserId)) {
      distinctOrder.push(log.platformUserId);
    }
  }
  const idx = distinctOrder.indexOf(targetRow.platformUserId);
  return idx === -1 ? null : idx + 1;
}

async function attachFailureSequenceNumbers(rows) {
  if (!rows.length || !db.GameBotAutomationFailureLog) return rows;

  const gameIds = [...new Set(rows.map((row) => row.gameId).filter(Boolean))];
  if (!gameIds.length) return rows.map((row) => ({ ...row, failureSequenceNumber: null }));

  let minCreatedAt = new Date(rows[0].createdAt);
  let maxCreatedAt = new Date(rows[0].createdAt);
  for (const row of rows) {
    const t = new Date(row.createdAt);
    if (t < minCreatedAt) minCreatedAt = t;
    if (t > maxCreatedAt) maxCreatedAt = t;
  }
  const contextStart = new Date(minCreatedAt.getTime() - BOT_AUTOMATION_FAILURE_WINDOW_MS);

  const contextRows = await db.GameBotAutomationFailureLog.findAll({
    where: {
      gameId: { [Op.in]: gameIds },
      operationType: { [Op.in]: MANUAL_MODE_THRESHOLD_OPERATION_TYPES },
      createdAt: {
        [Op.gte]: contextStart,
        [Op.lte]: maxCreatedAt
      }
    },
    attributes: ['id', 'gameId', 'storeCode', 'platformUserId', 'createdAt'],
    order: [['createdAt', 'ASC']],
    raw: true
  });

  const groups = new Map();
  for (const log of contextRows) {
    const key = gameStoreKey(log.game_id ?? log.gameId, log.store_code ?? log.storeCode);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      gameId: log.game_id ?? log.gameId,
      storeCode: log.store_code ?? log.storeCode,
      platformUserId: log.platform_user_id ?? log.platformUserId,
      createdAt: log.created_at ?? log.createdAt
    });
  }

  return rows.map((row) => ({
    ...row,
    failureSequenceNumber: computeDistinctUserSequence(
      groups.get(gameStoreKey(row.gameId, row.storeCode)) || [],
      row
    )
  }));
}

function parseExternalResponse(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function serializeExternalResponse(externalResponse) {
  if (externalResponse == null || externalResponse === '') return null;
  if (typeof externalResponse === 'string') return externalResponse;
  try {
    return JSON.stringify(externalResponse);
  } catch {
    return String(externalResponse);
  }
}

function buildWhereClause({
  storeCode = null,
  gameId = null,
  gameName = null,
  operation = null,
  platformUserId = null,
  startDate = null,
  endDate = null,
  timezoneOffset = null
} = {}) {
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

  if (operation != null && String(operation).trim() !== '' && String(operation).trim() !== 'all') {
    where.operationType = String(operation).trim();
  } else {
    where.operationType = { [Op.in]: MANUAL_MODE_THRESHOLD_OPERATION_TYPES };
  }

  if (platformUserId != null && String(platformUserId).trim() !== '') {
    const uid = parseInt(platformUserId, 10);
    if (!Number.isNaN(uid)) where.platformUserId = uid;
  }

  const from = toDateRangeStart(startDate, timezoneOffset);
  const to = toDateRangeEnd(endDate, timezoneOffset);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

  return where;
}

/**
 * Paginated bot automation failure logs for technical staff.
 */
async function getGameBotAutomationFailureLogs({
  page = 1,
  limit = 25,
  storeCode = null,
  gameId = null,
  gameName = null,
  operation = null,
  platformUserId = null,
  startDate = null,
  endDate = null,
  timezoneOffset = null
} = {}) {
  if (!db.GameBotAutomationFailureLog) {
    return {
      rows: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0
    };
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (safePage - 1) * safeLimit;
  const where = buildWhereClause({
    storeCode,
    gameId,
    gameName,
    operation,
    platformUserId,
    startDate,
    endDate,
    timezoneOffset
  });

  const { count, rows } = await db.GameBotAutomationFailureLog.findAndCountAll({
    where,
    include: [
      {
        model: db.User,
        attributes: ['userId', 'username', 'email'],
        required: false
      },
      {
        model: db.Game,
        attributes: ['id', 'botUsername', 'botPassword'],
        required: false
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  const list = rows.map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    const user = json.User || null;
    const game = json.Game || null;
    const code = json.storeCode || null;
    return {
      id: json.id,
      gameId: json.gameId,
      gameName: json.gameName,
      storeCode: code,
      storeName: code ? storeCodeToDisplayName(code) : null,
      platformUserId: json.platformUserId,
      platformUsername: user?.username || null,
      platformUserEmail: user?.email || null,
      operationType: json.operationType,
      errorSummary: json.errorSummary,
      gameUsername: json.gameUsername,
      gameBotUsername: game?.botUsername || null,
      gameBotPassword: game?.botPassword || null,
      externalResponse: parseExternalResponse(json.externalResponse),
      createdAt: json.createdAt
    };
  });

  const rowsWithSequence = await attachFailureSequenceNumbers(list);

  return {
    rows: rowsWithSequence,
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(count / safeLimit) || 0
  };
}

module.exports = {
  serializeExternalResponse,
  getGameBotAutomationFailureLogs
};
