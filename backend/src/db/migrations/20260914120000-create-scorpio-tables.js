'use strict';

/**
 * Scorpio Play player map + idempotent wallet transactions for seamless callbacks.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS scorpio_players (
        user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        player_external_id VARCHAR(64) NOT NULL,
        player_code BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT scorpio_players_external_id_unique UNIQUE (player_external_id)
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS scorpio_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        transaction_id VARCHAR(128) NOT NULL,
        reference_id VARCHAR(128),
        round_id VARCHAR(128),
        command VARCHAR(16) NOT NULL,
        amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        game_code VARCHAR(128),
        provider_id INTEGER,
        status VARCHAR(16) NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT scorpio_transactions_tx_unique UNIQUE (transaction_id)
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS scorpio_transactions_user_id_idx ON scorpio_transactions(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS scorpio_transactions_reference_id_idx ON scorpio_transactions(reference_id)`);
    await q(`CREATE INDEX IF NOT EXISTS scorpio_transactions_round_id_idx ON scorpio_transactions(round_id)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS scorpio_transactions`);
    await q(`DROP TABLE IF EXISTS scorpio_players`);
  }
};
