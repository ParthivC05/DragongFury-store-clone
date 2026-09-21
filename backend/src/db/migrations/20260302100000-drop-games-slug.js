'use strict';

/**
 * Drop slug column from games table if it exists.
 * Run this migration to fix "Game.slug cannot be null" after removing slug from the model.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games'
       AND column_name = 'slug'`,
      { transaction }
    );
    if (cols && cols.length > 0) {
      await sequelize.query(`ALTER TABLE games ALTER COLUMN slug DROP NOT NULL`, { transaction });
      await sequelize.query(`ALTER TABLE games DROP COLUMN slug`, { transaction });
    }
  },

  async down() {
    // Re-adding slug would require data decisions; leave no-op.
  }
};
