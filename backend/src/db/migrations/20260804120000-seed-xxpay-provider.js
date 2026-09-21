'use strict';

/**
 * Seed XXPay provider. Opt-in per store (like DollarPay).
 * Enable fully only for storeCode = sweepstakebet.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction, replacements });

    const depositMethods = JSON.stringify({
      card: true,
      cashapp: true,
      chime: true,
      apple_pay: true,
      google_pay: true,
      paypal: true,
      zelle: true
    });
    const withdrawMethods = JSON.stringify({
      cashapp: true,
      chime: true,
      paypal: true,
      venmo: true,
      zelle: true,
      card: true,
      bank_transfer: true
    });

    await q(`
      INSERT INTO payment_providers (
        code, name, is_active, supports_deposit, supports_withdraw,
        deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      ) VALUES (
        'xxpay', 'XXPay', true, true, true, true, true, 4,
        :depositMethods::jsonb,
        :withdrawMethods::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        supports_deposit = true,
        supports_withdraw = true,
        deposit_enabled = true,
        withdraw_enabled = true,
        deposit_methods_enabled = EXCLUDED.deposit_methods_enabled,
        withdraw_methods_enabled = EXCLUDED.withdraw_methods_enabled,
        updated_at = NOW()
    `, { depositMethods, withdrawMethods });

    // All existing stores: XXPay row OFF by default
    await q(`
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT spp.distributor_code, spp.store_code, 'xxpay',
        false, false, false, 4,
        :depositMethods::jsonb,
        :withdrawMethods::jsonb,
        NOW(), NOW()
      FROM store_payment_providers spp
      ON CONFLICT (distributor_code, store_code, provider_code) DO NOTHING
    `, { depositMethods, withdrawMethods });

    // Enable only sweepstakebet
    await q(`
      UPDATE store_payment_providers
      SET
        enabled = true,
        deposit_enabled = true,
        withdraw_enabled = true,
        deposit_methods_enabled = :depositMethods::jsonb,
        withdraw_methods_enabled = :withdrawMethods::jsonb,
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) = 'sweepstakebet'
    `, { depositMethods, withdrawMethods });

    // Ensure a row exists for sweepstakebet even if store had no other providers yet
    await q(`
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT u.distributor_code, u.store_code, 'xxpay',
        true, true, true, 4,
        :depositMethods::jsonb,
        :withdrawMethods::jsonb,
        NOW(), NOW()
      FROM users u
      WHERE LOWER(u.store_code) = 'sweepstakebet'
        AND u.distributor_code IS NOT NULL
        AND u.store_code IS NOT NULL
      ON CONFLICT (distributor_code, store_code, provider_code) DO UPDATE SET
        enabled = true,
        deposit_enabled = true,
        withdraw_enabled = true,
        deposit_methods_enabled = EXCLUDED.deposit_methods_enabled,
        withdraw_methods_enabled = EXCLUDED.withdraw_methods_enabled,
        updated_at = NOW()
    `, { depositMethods, withdrawMethods });

    const table = 'chime_cashapp_withdrawal_requests';
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (desc && !desc.destination_meta) {
      await queryInterface.addColumn(
        table,
        'destination_meta',
        { type: Sequelize.JSONB, allowNull: true },
        { transaction }
      );
    }
    if (desc && !desc.xxpay_base_url) {
      await queryInterface.addColumn(
        table,
        'xxpay_base_url',
        { type: Sequelize.STRING(255), allowNull: true },
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = 'chime_cashapp_withdrawal_requests';
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (desc?.destination_meta) {
      await queryInterface.removeColumn(table, 'destination_meta', { transaction });
    }
    if (desc?.xxpay_base_url) {
      await queryInterface.removeColumn(table, 'xxpay_base_url', { transaction });
    }
    await queryInterface.sequelize.query(`DELETE FROM store_payment_providers WHERE provider_code = 'xxpay'`, {
      transaction
    });
    await queryInterface.sequelize.query(`DELETE FROM payment_providers WHERE code = 'xxpay'`, { transaction });
  }
};
