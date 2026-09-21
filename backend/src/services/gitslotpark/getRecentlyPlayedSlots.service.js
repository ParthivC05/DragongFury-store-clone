'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

/**
 * Distinct games the user has actually bet on in the last 7 days (from slots transactions), newest first.
 * @param {number} userId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ games: Array<{ gameId: number, provider: string, playedAt: string }> }>}
 */
async function getRecentlyPlayedSlots({ userId, limit = DEFAULT_LIMIT } = {}) {
  const id = userId != null ? Number(userId) : null;
  if (!Number.isInteger(id) || id <= 0) {
    return { games: [] };
  }

  if (!db.sequelize) {
    return { games: [] };
  }

  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));

  const rows = await db.sequelize.query(
    `
      SELECT
        game_id AS "gameId",
        COALESCE(NULLIF(TRIM(provider), ''), 'gitslotpark') AS provider,
        MAX(created_at) AS "playedAt"
      FROM gitslotpark_transactions
      WHERE user_id = :userId
        AND game_id IS NOT NULL
        AND status = 'completed'
        AND created_at >= NOW() - INTERVAL '7 days'
        AND (
          operation IN ('withdraw', 'betwin')
          OR (bet_amount IS NOT NULL AND bet_amount > 0)
        )
      GROUP BY game_id, COALESCE(NULLIF(TRIM(provider), ''), 'gitslotpark')
      ORDER BY MAX(created_at) DESC
      LIMIT :limitNum
    `,
    {
      replacements: { userId: id, limitNum },
      type: QueryTypes.SELECT
    }
  );

  const games = (rows || [])
    .map((row) => {
      const gameId = row.gameId != null ? Number(row.gameId) : null;
      if (!Number.isFinite(gameId) || gameId <= 0) return null;
      return {
        gameId,
        provider: String(row.provider || 'gitslotpark').trim().toLowerCase() || 'gitslotpark',
        playedAt: row.playedAt ? new Date(row.playedAt).toISOString() : null
      };
    })
    .filter(Boolean);

  return { games };
}

module.exports = {
  getRecentlyPlayedSlots,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
