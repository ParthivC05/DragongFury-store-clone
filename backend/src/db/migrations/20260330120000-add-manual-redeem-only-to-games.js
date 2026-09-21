'use strict';

/**
 * Idempotent: safe when `manual_redeem_only` was added manually or a previous run partially applied.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE games
      ADD COLUMN IF NOT EXISTS manual_redeem_only BOOLEAN NOT NULL DEFAULT false
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('games', 'manual_redeem_only', { transaction }).catch(() => {});
  }
};
