const db = require('../../db/models');
const { Op } = require('sequelize');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Get all topup and redeem (withdraw) transactions for a specific game and user.
 * @param {number} userId
 * @param {object} body - { gameName, page, limit }
 */
async function getGameTransactions(userId, body = {}) {
  const gameName =
    body.gameName && typeof body.gameName === 'string'
      ? body.gameName.trim()
      : null;

  if (!gameName) {
    const err = new Error('gameName is required');
    err.statusCode = 400;
    throw err;
  }

  const game = await db.Game.findOne({
    where: db.sequelize.where(
      db.sequelize.fn('LOWER', db.sequelize.col('name')),
      gameName.toLowerCase()
    )
  });

  if (!game) {
    const err = new Error(`Game "${gameName}" not found`);
    err.statusCode = 404;
    throw err;
  }

  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(body.limit, 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const { count, rows } = await db.GameActivity.findAndCountAll({
    where: {
      userId,
      gameId: game.id,
      activityType: { [Op.in]: ['topup', 'withdraw', 'redeem'] }
    },
    order: [['created_at', 'DESC']],
    limit,
    offset,
    attributes: ['id', 'activityType', 'amount', 'metadata', 'created_at']
  });

  const transactions = rows.map((r) => ({
    id: r.id,
    type: r.activityType,
    coins: Number(r.amount),
    metadata: r.metadata || null,
    created_at: r.created_at
  }));

  return {
    game_name: game.name,
    transactions,
    total: count,
    page,
    limit,
    total_pages: Math.ceil(count / limit)
  };
}

module.exports = { getGameTransactions };
