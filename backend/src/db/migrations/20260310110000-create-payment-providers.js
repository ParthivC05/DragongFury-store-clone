'use strict';

/**
 * Create payment_providers table and seed scrypto + orionstarspay.
 * Used for deposit-methods (active only) and admin activate/deactivate.
 */
const TABLE = 'payment_providers';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        supports_deposit BOOLEAN NOT NULL DEFAULT true,
        supports_withdraw BOOLEAN NOT NULL DEFAULT false,
        display_order SMALLINT DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      INSERT INTO ${TABLE} (code, name, is_active, supports_deposit, supports_withdraw, display_order, created_at, updated_at)
      VALUES
        ('scrypto', 'SCrypto', true, true, true, 1, NOW(), NOW()),
        ('orionstarspay', 'Orionstar Pay', true, true, false, 2, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
