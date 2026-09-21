'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const { isBlockedBrand } = require('./onegamehub.constants');
const { isHiddenBrokenProviderGame } = require('../../constants/hiddenBrokenGames');

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

async function getRecentlyPlayed({ userId, limit = DEFAULT_LIMIT } = {}) {
  const id = userId != null ? Number(userId) : null;
  if (!Number.isInteger(id) || id <= 0 || !db.sequelize) {
    return { games: [] };
  }

  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));

  const rows = await db.sequelize.query(
    `
      SELECT
        game_id AS "gameId",
        MAX(created_at) AS "playedAt"
      FROM one_game_hub_transactions
      WHERE user_id = :userId
        AND game_id IS NOT NULL
        AND status = 'completed'
        AND operation = 'bet'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY game_id
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
      const gameId = row.gameId != null ? String(row.gameId).trim() : '';
      if (!gameId) return null;
      return {
        gameId,
        provider: 'onegamehub',
        playedAt: row.playedAt ? new Date(row.playedAt).toISOString() : null
      };
    })
    .filter(Boolean)
    .filter((game) => !isBlockedBrand(game.gameId) && !isHiddenBrokenProviderGame(game.gameId));

  return { games };
}

module.exports = { getRecentlyPlayed };
