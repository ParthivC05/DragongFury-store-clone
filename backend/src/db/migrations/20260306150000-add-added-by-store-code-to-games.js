'use strict';

/**
 * Add added_by_store_code to games table to allow role-based game visibility.
 * Idempotent: safe to run if the column already exists.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'added_by_store_code'`,
      { transaction }
    );
    if (!cols || cols.length === 0) {
      await queryInterface.addColumn('games', 'added_by_store_code', {
        type: Sequelize.STRING(64),
        allowNull: true
      }, { transaction });
    }
    const [indexes] = await queryInterface.sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'games' AND indexname LIKE '%added_by_store_code%'`,
      { transaction }
    );
    if (!indexes || indexes.length === 0) {
      await queryInterface.addIndex('games', ['added_by_store_code'], { transaction });
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'added_by_store_code'`,
      { transaction }
    );
    if (cols && cols.length) {
      await queryInterface.removeColumn('games', 'added_by_store_code', { transaction });
    }
  }
};
