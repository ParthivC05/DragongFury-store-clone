'use strict';

/**
 * Seed XXPay Card (deposit) + PayPal (withdraw) method keys OFF for all
 * XXPay-allowlisted stores. Admin must toggle them on Payment Methods.
 * Does not flip Cash App / Chime or other providers.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const stores = [
      'sweepstakebet',
      'dragonfury',
      'myvepower',
      'goodgdragon',
      'casinoslots',
      'goodwork',
      'winners4'
    ];
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET
        deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || '{"card": false}'::jsonb,
        withdraw_methods_enabled =
          COALESCE(withdraw_methods_enabled, '{}'::jsonb)
          || '{"paypal": false}'::jsonb,
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) IN (${stores.map((s) => `'${s}'`).join(', ')})
      `,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET
        deposit_methods_enabled = (COALESCE(deposit_methods_enabled, '{}'::jsonb) - 'card'),
        withdraw_methods_enabled = (COALESCE(withdraw_methods_enabled, '{}'::jsonb) - 'paypal'),
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) IN (
          'sweepstakebet', 'dragonfury', 'myvepower', 'goodgdragon',
          'casinoslots', 'goodwork', 'winners4'
        )
      `,
      { transaction }
    );
  }
};
