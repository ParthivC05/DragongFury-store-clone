'use strict';

/**
 * Create payment_transactions table to store every payment API transaction we learn about,
 * so we never lose data (success, failed, or incomplete). Record as soon as we have transactionId.
 */
const TABLE = 'payment_transactions';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(128) NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        amount DECIMAL(18,2),
        currency VARCHAR(8),
        status VARCHAR(64),
        event_type VARCHAR(32),
        raw_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS payment_transactions_transaction_id
      ON ${TABLE}(transaction_id)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS payment_transactions_user_id
      ON ${TABLE}(user_id)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS payment_transactions_status
      ON ${TABLE}(status)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
