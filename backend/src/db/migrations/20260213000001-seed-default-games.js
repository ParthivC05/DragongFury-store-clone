'use strict';

const { Op } = require('sequelize');

/**
 * Seed default games (all BOTs from Orionstars). Admin can set bot_api_url, bot_username, bot_password, is_active in DB.
 */
const DEFAULT_GAMES = [
  { name: 'Orion Stars', bot_type: 'orionstars', display_order: 1 },
  { name: 'JUWA', bot_type: 'juwa', display_order: 2 },
  { name: 'Game Vault', bot_type: 'gamevault', display_order: 3 },
  { name: 'Dragon', bot_type: 'dragon', display_order: 4 },
  { name: 'River Pay', bot_type: 'riverpay', display_order: 5 },
  { name: 'Milky Way', bot_type: 'milkyway', display_order: 6 }
];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [countResult] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS cnt FROM games',
      { transaction }
    );
    const count = countResult && countResult[0] && countResult[0].cnt != null ? Number(countResult[0].cnt) : 0;
    if (count > 0) return;

    const now = new Date();
    const rows = DEFAULT_GAMES.map((g) => ({
      name: g.name,
      image_url: null,
      bot_type: g.bot_type,
      bot_api_url: null,
      bot_username: null,
      bot_password: null,
      is_active: true,
      display_order: g.display_order,
      created_at: now,
      updated_at: now
    }));
    await queryInterface.bulkInsert('games', rows, { transaction });
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const names = DEFAULT_GAMES.map((g) => g.name);
    await queryInterface.bulkDelete('games', { name: { [Op.in]: names } }, { transaction });
  }
};
