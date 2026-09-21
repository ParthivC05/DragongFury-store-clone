'use strict';

/**
 * Add per–payment-method enable/disable for deposit and withdraw.
 * payment_providers: master-level; store_payment_providers: store-level override.
 * JSONB: { "card": true, "apple_pay": true, "google_pay": true, "cashapp": true, "crypto": true }.
 * Null or missing key = enabled (backward compat).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE payment_providers
      ADD COLUMN IF NOT EXISTS deposit_methods_enabled JSONB NULL,
      ADD COLUMN IF NOT EXISTS withdraw_methods_enabled JSONB NULL
    `);
    await q(`
      ALTER TABLE store_payment_providers
      ADD COLUMN IF NOT EXISTS deposit_methods_enabled JSONB NULL,
      ADD COLUMN IF NOT EXISTS withdraw_methods_enabled JSONB NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`ALTER TABLE payment_providers DROP COLUMN IF EXISTS deposit_methods_enabled, DROP COLUMN IF EXISTS withdraw_methods_enabled`);
    await q(`ALTER TABLE store_payment_providers DROP COLUMN IF EXISTS deposit_methods_enabled, DROP COLUMN IF EXISTS withdraw_methods_enabled`);
  }
};
