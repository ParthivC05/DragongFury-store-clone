'use strict';

/**
 * Store-level payment provider overrides.
 * Store admin can enable/disable which master-enabled providers their store's users can use.
 * No row = inherit from global (enabled). Row with deposit_enabled=false or withdraw_enabled=false = disabled for that store.
 */
const TABLE = 'store_payment_providers';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        distributor_code VARCHAR(64) NOT NULL,
        store_code VARCHAR(64) NOT NULL,
        provider_code VARCHAR(64) NOT NULL,
        deposit_enabled BOOLEAN NOT NULL DEFAULT true,
        withdraw_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(distributor_code, store_code, provider_code)
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
