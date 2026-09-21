'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { CUSTOM_MANUAL_GAME_KEY } = require('../../utils/gameIntegration.helpers');

let cachedCustomGameIds = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Game IDs for store-defined custom manual games (no automation APIs).
 * Cached briefly to avoid repeating the lookup on every game-logs request.
 * @returns {Promise<number[]>}
 */
async function getCustomManualGameIds() {
  const now = Date.now();
  if (cachedCustomGameIds && now - cachedAt < CACHE_TTL_MS) {
    return cachedCustomGameIds;
  }
  const rows = await db.Game.findAll({
    where: { gameKey: CUSTOM_MANUAL_GAME_KEY },
    attributes: ['id'],
    raw: true
  });
  cachedCustomGameIds = rows.map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0);
  cachedAt = now;
  return cachedCustomGameIds;
}

/**
 * Merge a game_activities where clause that excludes custom manual games.
 * @param {object} [activityWhere]
 * @returns {Promise<object>}
 */
async function withCustomManualGamesExcluded(activityWhere = {}) {
  const ids = await getCustomManualGameIds();
  if (!ids.length) return { ...activityWhere };

  const next = { ...activityWhere };
  if (next.gameId == null) {
    next.gameId = { [Op.notIn]: ids };
    return next;
  }

  // Preserve an existing gameId filter by intersecting with the exclusion.
  const existing = next.gameId;
  if (existing && typeof existing === 'object' && existing[Op.in]) {
    const allowed = (existing[Op.in] || []).filter((id) => !ids.includes(Number(id)));
    next.gameId = allowed.length ? { [Op.in]: allowed } : { [Op.in]: [-1] };
    return next;
  }
  if (existing && typeof existing === 'object' && existing[Op.notIn]) {
    const merged = [...new Set([...(existing[Op.notIn] || []).map(Number), ...ids])];
    next.gameId = { [Op.notIn]: merged };
    return next;
  }
  if (typeof existing === 'number' || typeof existing === 'string') {
    next.gameId = ids.includes(Number(existing)) ? { [Op.in]: [-1] } : existing;
    return next;
  }

  next.gameId = { [Op.and]: [existing, { [Op.notIn]: ids }] };
  return next;
}

/**
 * SQL fragment + replacements to exclude custom games from raw game_activities queries.
 * @returns {Promise<{ clause: string, replacements: object }>}
 */
async function getCustomManualGamesSqlExclusion(alias = 'ga') {
  const ids = await getCustomManualGameIds();
  if (!ids.length) return { clause: '', replacements: {} };
  return {
    clause: ` AND ${alias}.game_id NOT IN (:excludeCustomGameIds)`,
    replacements: { excludeCustomGameIds: ids }
  };
}

module.exports = {
  getCustomManualGameIds,
  withCustomManualGamesExcluded,
  getCustomManualGamesSqlExclusion
};
