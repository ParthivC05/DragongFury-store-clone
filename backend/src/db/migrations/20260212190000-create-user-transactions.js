'use strict';

/**
 * Idempotent: create user_transactions table and indexes if they do not exist.
 * Safe to run on every server start (matches runMigrations pattern).
 */
const TABLE = 'user_transactions';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        type VARCHAR(32) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        currency_code VARCHAR(10) NOT NULL DEFAULT 'SC',
        description VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS user_transactions_user_id ON ${TABLE}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS user_transactions_user_id_created_at ON ${TABLE}(user_id, created_at)`);
    await q(`CREATE INDEX IF NOT EXISTS user_transactions_user_id_type ON ${TABLE}(user_id, type)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
