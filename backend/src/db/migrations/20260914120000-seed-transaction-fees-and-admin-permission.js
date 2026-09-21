'use strict';

const PAYIN_KEY = 'payin_fee_percent';
const PAYOUT_KEY = 'payout_fee_percent';
const DEFAULT_VALUE = '0';

/**
 * Seed platform-default 0% payin/payout fees and grant transaction_fees
 * to existing technical-staff roles that already manage payments or stores.
 * Idempotent: safe if settings/permission rows already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;

    await queryInterface.sequelize.query(
      `INSERT INTO settings (key, value, distributor_code, store_code, created_at, updated_at)
       SELECT $1::varchar, $2::text, NULL, NULL, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM settings
         WHERE key = $1::varchar AND distributor_code IS NULL AND store_code IS NULL
       )`,
      { bind: [PAYIN_KEY, DEFAULT_VALUE], transaction }
    );

    await queryInterface.sequelize.query(
      `INSERT INTO settings (key, value, distributor_code, store_code, created_at, updated_at)
       SELECT $1::varchar, $2::text, NULL, NULL, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM settings
         WHERE key = $1::varchar AND distributor_code IS NULL AND store_code IS NULL
       )`,
      { bind: [PAYOUT_KEY, DEFAULT_VALUE], transaction }
    );

    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"transaction_fees": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'transaction_fees')
         AND (
           COALESCE((permissions->>'payment_providers')::boolean, false) = true
           OR COALESCE((permissions->>'user_deposits')::boolean, false) = true
           OR COALESCE((permissions->>'payment_totals')::boolean, false) = true
           OR COALESCE((permissions->>'stores')::boolean, false) = true
         )`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"transaction_fees": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'transaction_fees')
         AND LOWER(TRIM(slug)) IN ('technical', 'technical-staff', 'techincal-staff', 'techincal')`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DELETE FROM settings
       WHERE key IN ($1, $2) AND distributor_code IS NULL AND store_code IS NULL`,
      { bind: [PAYIN_KEY, PAYOUT_KEY], transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'transaction_fees',
           updated_at = NOW()
       WHERE permissions ? 'transaction_fees'`,
      { transaction }
    );
  }
};
