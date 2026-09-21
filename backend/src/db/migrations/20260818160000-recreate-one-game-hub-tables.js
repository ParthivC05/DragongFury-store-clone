'use strict';

const SESSIONS = 'one_game_hub_sessions';
const TRANSACTIONS = 'one_game_hub_transactions';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${SESSIONS} (
        player_id VARCHAR(32) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        store_code VARCHAR(64) NOT NULL DEFAULT '',
        game_id VARCHAR(50) NOT NULL,
        currency VARCHAR(4) NOT NULL DEFAULT 'SSC',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS one_game_hub_sessions_user_id_idx ON ${SESSIONS}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS one_game_hub_sessions_expires_at_idx ON ${SESSIONS}(expires_at)`);

    await q(`
      CREATE TABLE IF NOT EXISTS ${TRANSACTIONS} (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(128) NOT NULL,
        provider_transaction_id VARCHAR(64),
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        store_code VARCHAR(64) NOT NULL DEFAULT '',
        operation VARCHAR(32) NOT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        balance_after DECIMAL(18,2) NOT NULL,
        game_id VARCHAR(50),
        round_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'completed',
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT one_game_hub_transactions_transaction_id_unique UNIQUE (transaction_id)
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS one_game_hub_transactions_user_id_idx ON ${TRANSACTIONS}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS one_game_hub_transactions_round_id_idx ON ${TRANSACTIONS}(round_id)`);
    await q(`CREATE INDEX IF NOT EXISTS one_game_hub_transactions_game_id_idx ON ${TRANSACTIONS}(game_id)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${TRANSACTIONS} CASCADE`, { transaction });
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${SESSIONS} CASCADE`, { transaction });
  }
};
