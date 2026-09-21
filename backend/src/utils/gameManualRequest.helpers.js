'use strict';

const { Op } = require('sequelize');

/**
 * For deposit/redeem manual requests, attach gameUsername from UserGameAccount when not stored on the row.
 */
async function attachGameUsernamesToManualRequests(db, records) {
  const list = records.map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : { ...r }));
  const missing = list.filter(
    (r) => (r.requestType === 'deposit' || r.requestType === 'redeem') && !r.gameUsername
  );
  if (missing.length === 0) return list;

  const pairs = new Map();
  for (const r of missing) {
    pairs.set(`${r.userId}:${r.gameId}`, { userId: r.userId, gameId: r.gameId });
  }

  const accounts = await db.UserGameAccount.findAll({
    where: { [Op.or]: [...pairs.values()] },
    attributes: ['userId', 'gameId', 'botUsername']
  });

  const byKey = new Map();
  for (const a of accounts) {
    if (a.botUsername) byKey.set(`${a.userId}:${a.gameId}`, a.botUsername);
  }

  return list.map((r) => {
    if ((r.requestType === 'deposit' || r.requestType === 'redeem') && !r.gameUsername) {
      const username = byKey.get(`${r.userId}:${r.gameId}`);
      if (username) return { ...r, gameUsername: username };
    }
    return r;
  });
}

/**
 * Narrow manual-request list to rows whose game username matches (case-insensitive).
 * Matches game_username on the request row and bot_username on the user's game account.
 */
async function appendGameUsernameSearchToWhere(db, where, gameUsernameSearch) {
  const term = String(gameUsernameSearch || '').trim();
  if (!term) return where;

  const pattern = `%${term}%`;
  const orConditions = [{ gameUsername: { [Op.iLike]: pattern } }];

  const matchingAccounts = await db.UserGameAccount.findAll({
    where: { botUsername: { [Op.iLike]: pattern } },
    attributes: ['userId', 'gameId'],
    raw: true
  });

  const uniquePairs = new Map();
  for (const a of matchingAccounts) {
    uniquePairs.set(`${a.userId}:${a.gameId}`, { userId: a.userId, gameId: a.gameId });
  }
  const pairs = [...uniquePairs.values()];
  if (pairs.length > 0) {
    orConditions.push({ [Op.or]: pairs });
  }

  return {
    [Op.and]: [where, { [Op.or]: orConditions }]
  };
}

module.exports = { attachGameUsernamesToManualRequests, appendGameUsernameSearchToWhere };
