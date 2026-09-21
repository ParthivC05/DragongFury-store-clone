'use strict';

/**
 * Enable XXPay store_payment_providers for dragonfury.
 *
 * SAFETY: does NOT assign Cash App / Chime (or any method) to XXPay.
 * - Touches ONLY provider_code = 'xxpay'.
 * - Enables provider flags only; forces cashapp/chime method maps to false
 *   so existing DollarPay/manual routing is unchanged until admin toggles.
 * - Never updates dollarpay / orionstarspay / manual / scrypto rows.
 *
 * Note: if this migration already ran in an environment with methods ON,
 * re-running will not apply; use admin (or a one-off SQL) to turn methods off.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction, replacements });

    // Explicit OFF — empty {} means all methods ON in isMethodEnabledInMap.
    const xxpayMethodsOff = JSON.stringify({ cashapp: false, chime: false });

    // Ensure global provider exists; do not overwrite existing master method flags.
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

    // Stub for every store (still OFF). DO NOTHING preserves existing rows.
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

    // dragonfury: provider ON, methods OFF until admin enables Cash App / Chime on XXPay.
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
        AND LOWER(store_code) = 'dragonfury'
    `,
      { xxpayMethodsOff }
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
      WHERE LOWER(u.store_code) = 'dragonfury'
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
      { xxpayMethodsOff }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET
        enabled = false,
        deposit_enabled = false,
        withdraw_enabled = false,
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) = 'dragonfury'
      `,
      { transaction }
    );
  }
};
