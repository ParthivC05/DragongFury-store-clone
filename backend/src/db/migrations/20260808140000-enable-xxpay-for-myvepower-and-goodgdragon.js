'use strict';

/**
 * Enable XXPay provider rows for myvepower + goodgdragon ONLY.
 *
 * SAFETY — this migration must NEVER route any pay-in/payout method to XXPay:
 * - Touches ONLY provider_code = 'xxpay' rows (never dollarpay / orion / manual / scrypto).
 * - Does NOT flip Cash App / Chime (or any method) onto XXPay.
 * - Sets xxpay deposit/withdraw method maps to { cashapp: false, chime: false }.
 * - Empty `{}` is avoided for target stores because missing keys = ON in isMethodEnabledInMap.
 *
 * Admin must enable Cash App / Chime on XXPay manually when ready.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction, replacements });

    // Explicit OFF for XXPay channels (do not use {}).
    const xxpayMethodsOff = JSON.stringify({ cashapp: false, chime: false });
    const stores = ['myvepower', 'goodgdragon'];

    // Global catalog row only if missing — do not overwrite master method maps.
    await q(
      `
      INSERT INTO payment_providers (
        code, name, is_active, supports_deposit, supports_withdraw,
        deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      ) VALUES (
        'xxpay', 'XXPay', true, true, true, true, true, 4,
        :xxpayMethodsOff::jsonb,
        :xxpayMethodsOff::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (code) DO NOTHING
    `,
      { xxpayMethodsOff }
    );

    // Stub XXPay row for every store (still OFF). Methods OFF so enabling later
    // cannot accidentally route Cash App/Chime to XXPay without an admin toggle.
    // DO NOTHING: never overwrite existing store XXPay method maps for other stores.
    await q(
      `
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT spp.distributor_code, spp.store_code, 'xxpay',
        false, false, false, 4,
        :xxpayMethodsOff::jsonb,
        :xxpayMethodsOff::jsonb,
        NOW(), NOW()
      FROM store_payment_providers spp
      ON CONFLICT (distributor_code, store_code, provider_code) DO NOTHING
    `,
      { xxpayMethodsOff }
    );

    for (const storeCode of stores) {
      // Provider ON, methods OFF — DollarPay/manual keep owning Cash App / Chime.
      await q(
        `
        UPDATE store_payment_providers
        SET
          enabled = true,
          deposit_enabled = true,
          withdraw_enabled = true,
          deposit_methods_enabled = :xxpayMethodsOff::jsonb,
          withdraw_methods_enabled = :xxpayMethodsOff::jsonb,
          updated_at = NOW()
        WHERE provider_code = 'xxpay'
          AND LOWER(store_code) = :storeCode
      `,
        { xxpayMethodsOff, storeCode }
      );

      await q(
        `
        INSERT INTO store_payment_providers (
          distributor_code, store_code, provider_code,
          enabled, deposit_enabled, withdraw_enabled, display_order,
          deposit_methods_enabled, withdraw_methods_enabled,
          created_at, updated_at
        )
        SELECT DISTINCT u.distributor_code, u.store_code, 'xxpay',
          true, true, true, 4,
          :xxpayMethodsOff::jsonb,
          :xxpayMethodsOff::jsonb,
          NOW(), NOW()
        FROM users u
        WHERE LOWER(u.store_code) = :storeCode
          AND u.distributor_code IS NOT NULL
          AND u.store_code IS NOT NULL
        ON CONFLICT (distributor_code, store_code, provider_code) DO UPDATE SET
          enabled = true,
          deposit_enabled = true,
          withdraw_enabled = true,
          deposit_methods_enabled = :xxpayMethodsOff::jsonb,
          withdraw_methods_enabled = :xxpayMethodsOff::jsonb,
          updated_at = NOW()
      `,
        { xxpayMethodsOff, storeCode }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    // Only disable XXPay flags — do not alter method maps of any provider.
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET
        enabled = false,
        deposit_enabled = false,
        withdraw_enabled = false,
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) IN ('myvepower', 'goodgdragon')
      `,
      { transaction }
    );
  }
};
