'use strict';

/**
 * Seed a virtual "Manual" payment provider so admin can choose Manual vs DollarPay
 * for Cash App / Chime payouts, and Manual for Chime pay-in.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      INSERT INTO payment_providers (
        code, name, is_active, supports_deposit, supports_withdraw,
        deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      ) VALUES (
        'manual', 'Manual', true, true, true, true, true, 50,
        '{"chime":true}'::jsonb,
        '{"cashapp":true,"chime":true}'::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        is_active = true,
        supports_deposit = true,
        supports_withdraw = true,
        deposit_enabled = true,
        withdraw_enabled = true,
        deposit_methods_enabled = EXCLUDED.deposit_methods_enabled,
        withdraw_methods_enabled = EXCLUDED.withdraw_methods_enabled,
        updated_at = NOW()
    `);

    await q(`
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT spp.distributor_code, spp.store_code, 'manual',
        true, true, true, 50,
        '{"chime":true}'::jsonb,
        '{"cashapp":true,"chime":true}'::jsonb,
        NOW(), NOW()
      FROM store_payment_providers spp
      ON CONFLICT (distributor_code, store_code, provider_code) DO NOTHING
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(`DELETE FROM store_payment_providers WHERE provider_code = 'manual'`, {
      transaction
    });
    await queryInterface.sequelize.query(`DELETE FROM payment_providers WHERE code = 'manual'`, {
      transaction
    });
  }
};
