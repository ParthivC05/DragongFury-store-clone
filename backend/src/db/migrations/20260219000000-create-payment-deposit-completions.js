'use strict';

/**
 * Idempotent: create payment_deposit_completions table to track which payment API
 * transactions have been credited (avoid double-credit when payment succeeds).
 */
const TABLE = 'payment_deposit_completions';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(128) NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        amount DECIMAL(18,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS payment_deposit_completions_transaction_id
      ON ${TABLE}(transaction_id)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS payment_deposit_completions_user_id
      ON ${TABLE}(user_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
