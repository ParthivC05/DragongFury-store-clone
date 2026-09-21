'use strict';

/**
 * 568Win SDK uses one WalletPlayer.balance number (can go negative on rollback).
 * Keep it off PSC/BSC/RSC so other game providers are not touched.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS win568_players (
        user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        username VARCHAR(64) NOT NULL,
        balance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS win568_players`);
  }
};
