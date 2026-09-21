'use strict';

const USER_MAPPINGS = 'gitslotpark_user_mappings';
const TRANSACTIONS = 'gitslotpark_transactions';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${USER_MAPPINGS} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        gitslotpark_user_id VARCHAR(48) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT gitslotpark_user_mappings_user_id_unique UNIQUE (user_id),
        CONSTRAINT gitslotpark_user_mappings_gitslotpark_user_id_unique UNIQUE (gitslotpark_user_id)
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS gitslotpark_user_mappings_gitslotpark_user_id_idx
      ON ${USER_MAPPINGS}(gitslotpark_user_id)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${TRANSACTIONS} (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(128) NOT NULL,
        ref_transaction_id VARCHAR(128),
        platform_transaction_id VARCHAR(64) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        operation VARCHAR(32) NOT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        bet_amount DECIMAL(18,2),
        win_amount DECIMAL(18,2),
        balance_after DECIMAL(18,2) NOT NULL,
        game_id INTEGER,
        round_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT gitslotpark_transactions_transaction_id_unique UNIQUE (transaction_id)
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS gitslotpark_transactions_ref_transaction_id_idx
      ON ${TRANSACTIONS}(ref_transaction_id)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS gitslotpark_transactions_user_id_idx
      ON ${TRANSACTIONS}(user_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TRANSACTIONS, { transaction });
    await queryInterface.dropTable(USER_MAPPINGS, { transaction });
  }
};
