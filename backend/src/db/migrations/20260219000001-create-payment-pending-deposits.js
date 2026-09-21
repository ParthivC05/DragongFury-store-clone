'use strict';

/**
 * Idempotent: create payment_pending_deposits table.
 * One row per "create payin" request so every payment deposit attempt is visible in DB.
 */
const TABLE = 'payment_pending_deposits';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        amount DECIMAL(18,2) NOT NULL,
        payment_link TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS payment_pending_deposits_user_id ON ${TABLE}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS payment_pending_deposits_created_at ON ${TABLE}(created_at)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
