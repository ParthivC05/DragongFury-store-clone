'use strict';

/**
 * Add platform_game_url to games (URL where user can enter credentials and play).
 * Idempotent: only adds column if missing.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const [rows] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'platform_game_url'`,
      { transaction }
    );
    if (rows && rows.length > 0) return;
    await sequelize.query(
      `ALTER TABLE games ADD COLUMN platform_game_url VARCHAR(512)`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE games DROP COLUMN IF EXISTS platform_game_url`,
      { transaction }
    );
  }
};
