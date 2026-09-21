'use strict';

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
        'dollarpay', 'DollarPayWallet', true, true, true, true, true, 3,
        '{"card":true,"cashapp":true,"apple_pay":true,"google_pay":true}'::jsonb,
        '{"cashapp":true,"chime":true,"paypal":true}'::jsonb,
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
    `);

    await q(`
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT spp.distributor_code, spp.store_code, 'dollarpay',
        false, false, false, 3,
        '{"card":false,"cashapp":true,"apple_pay":true,"google_pay":true}'::jsonb,
        '{"cashapp":true,"chime":true,"paypal":true}'::jsonb,
        NOW(), NOW()
      FROM store_payment_providers spp
      ON CONFLICT (distributor_code, store_code, provider_code) DO NOTHING
    `);

    const table = 'chime_cashapp_withdrawal_requests';
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (!desc) return;
    const cols = {
      payment_provider: Sequelize.STRING(64),
      outer_order_sn: Sequelize.STRING(128),
      provider_transaction_id: Sequelize.STRING(128),
      dollarpay_merchant_id: Sequelize.STRING(64),
      dollarpay_key_encrypted: Sequelize.TEXT
    };
    for (const [name, type] of Object.entries(cols)) {
      if (!desc[name]) {
        await queryInterface.addColumn(table, name, { type, allowNull: true }, { transaction });
      }
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = 'chime_cashapp_withdrawal_requests';
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (desc) {
      for (const col of [
        'payment_provider',
        'outer_order_sn',
        'provider_transaction_id',
        'dollarpay_merchant_id',
        'dollarpay_key_encrypted'
      ]) {
        if (desc[col]) await queryInterface.removeColumn(table, col, { transaction });
      }
    }
    await queryInterface.sequelize.query(`DELETE FROM store_payment_providers WHERE provider_code = 'dollarpay'`, {
      transaction
    });
    await queryInterface.sequelize.query(`DELETE FROM payment_providers WHERE code = 'dollarpay'`, { transaction });
  }
};
