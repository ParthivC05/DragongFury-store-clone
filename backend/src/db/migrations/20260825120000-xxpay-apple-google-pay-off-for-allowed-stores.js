'use strict';

/**
 * Seed XXPay deposit Apple Pay / Google Pay keys OFF for:
 * myvepower, goodgdragon, goodwork (lucky winners).
 * dragonfury was seeded earlier in 20260817100000-dragonfury-xxpay-apple-google-pay-off.js.
 *
 * Does not enable those methods — admin must toggle them on Payment Methods.
 * Does not touch Cash App / Chime flags or any other store / provider.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET
        deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || '{"apple_pay": false, "google_pay": false}'::jsonb,
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) IN ('myvepower', 'goodgdragon', 'goodwork')
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
        deposit_methods_enabled = (COALESCE(deposit_methods_enabled, '{}'::jsonb) - 'apple_pay' - 'google_pay'),
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) IN ('myvepower', 'goodgdragon', 'goodwork')
      `,
      { transaction }
    );
  }
};
