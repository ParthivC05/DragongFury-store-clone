'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS win568_bets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        username VARCHAR(64) NOT NULL,
        transfer_code VARCHAR(128) NOT NULL,
        transaction_id VARCHAR(128) NOT NULL DEFAULT '',
        product_type INTEGER,
        game_type INTEGER,
        status VARCHAR(16) NOT NULL DEFAULT 'running',
        stake DECIMAL(18, 4) NOT NULL DEFAULT 0,
        winloss DECIMAL(18, 4),
        result_type INTEGER,
        ops JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT win568_bets_transfer_tx_unique UNIQUE (transfer_code, transaction_id)
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS win568_bets_user_id_idx ON win568_bets(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS win568_bets_transfer_code_idx ON win568_bets(transfer_code)`);

    await q(`
      CREATE TABLE IF NOT EXISTS win568_wallet_ops (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        username VARCHAR(64) NOT NULL,
        kind VARCHAR(32) NOT NULL,
        ref_no VARCHAR(128) NOT NULL,
        transaction_id VARCHAR(128) NOT NULL DEFAULT '',
        amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        transfer_type INTEGER,
        transfer_status INTEGER,
        wallet_op_key VARCHAR(160) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT win568_wallet_ops_kind_ref_tx_unique UNIQUE (kind, ref_no, transaction_id)
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS win568_wallet_ops_user_id_idx ON win568_wallet_ops(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS win568_wallet_ops_ref_no_idx ON win568_wallet_ops(ref_no)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS win568_wallet_ops`);
    await q(`DROP TABLE IF EXISTS win568_bets`);
  }
};
