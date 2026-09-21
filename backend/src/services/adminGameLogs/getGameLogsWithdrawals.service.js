'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { withCustomManualGamesExcluded } = require('./excludeCustomManualGames.helper');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function buildWhere(scope, startDate, endDate) {
  const where = {};
  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }
  return where;
}

function buildUserWhere(scope) {
  if (!scope || (typeof scope.storeCode !== 'string' && typeof scope.distributorCode !== 'string')) {
    return {};
  }
  const userWhere = {};
  if (scope.storeCode) userWhere.storeCode = scope.storeCode;
  if (scope.distributorCode) userWhere.distributorCode = scope.distributorCode;
  return userWhere;
}

async function getGameLogsWithdrawals({
  scope = {},
  startDate = null,
  endDate = null,
  page = 1,
  limit = DEFAULT_LIMIT,
  sortBy = 'createdAt',
  sortOrder = 'DESC'
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const offset = (pageNum - 1) * limitNum;

  const activityWhere = await withCustomManualGamesExcluded({
    ...buildWhere(scope, startDate, endDate),
    activityType: { [Op.in]: ['withdraw', 'redeem'] }
  });

  const userWhere = buildUserWhere(scope);
  const includeUser = Object.keys(userWhere).length > 0
    ? [{ model: db.User, as: 'User', attributes: ['userId', 'username'], where: userWhere, required: true }]
    : [{ model: db.User, as: 'User', attributes: ['userId', 'username'] }];

  const order = [[sortBy === 'createdAt' ? 'createdAt' : 'createdAt', (sortOrder || 'DESC').toUpperCase()]];

  const { rows, count: total } = await db.GameActivity.findAndCountAll({
    where: activityWhere,
    include: [
      ...includeUser,
      { model: db.Game, as: 'Game', attributes: ['id', 'name'] },
      { model: db.User, as: 'OperationDoneByUser', attributes: ['userId', 'username', 'firstName', 'lastName'], required: false }
    ],
    order,
    limit: limitNum,
    offset,
    attributes: ['id', 'userId', 'gameId', 'activityType', 'amount', 'operationDoneBy', 'operationDoneByUserId', 'createdAt']
  });

  const accountPairs = [...new Set(rows.map((r) => {
    const j = r.get ? r.get({ plain: true }) : r;
    return `${j.userId}:${j.gameId}`;
  }))].map((key) => {
    const [userId, gameId] = key.split(':').map(Number);
    return { userId, gameId };
  });

  const gameUsernameByPair = new Map();
  if (accountPairs.length > 0 && db.UserGameAccount) {
    const accounts = await db.UserGameAccount.findAll({
      where: { [Op.or]: accountPairs },
      attributes: ['userId', 'gameId', 'botUsername']
    });
    for (const account of accounts) {
      const plain = account.get ? account.get({ plain: true }) : account;
      gameUsernameByPair.set(`${plain.userId}:${plain.gameId}`, plain.botUsername || null);
    }
  }

  const list = rows.map((r) => {
    const j = r.get ? r.get({ plain: true }) : r;
    const u = j.User || {};
    const g = j.Game || {};
    const doneBy = j.OperationDoneByUser;
    const doneByUserName = doneBy ? (doneBy.username || [doneBy.firstName, doneBy.lastName].filter(Boolean).join(' ') || '—') : 'Automation tool';
    return {
      id: j.id,
      userId: u.userId,
      username: u.username,
      gameName: g.name,
      gameUsername: gameUsernameByPair.get(`${j.userId}:${j.gameId}`) || null,
      amount: j.amount,
      currencyCode: 'SC',
      status: 'success',
      operationDoneBy: j.operationDoneBy,
      doneByUserName,
      createdAt: j.createdAt
    };
  });

  return {
    rows: list,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}

module.exports = { getGameLogsWithdrawals };
