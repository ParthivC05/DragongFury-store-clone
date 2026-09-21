'use strict';

/**
 * Direct Crypto is available for every store.
 * Insert missing store_payment_providers rows and turn the rail on.
 * Does not change Speed (scrypto) or other providers.
 */
const PROVIDER = 'selfcrypto';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction, replacements });

    const depositMethods = JSON.stringify({ crypto: true });
    const withdrawMethods = JSON.stringify({ crypto: false });

    await q(`
      INSERT INTO payment_providers (
        code, name, is_active, supports_deposit, supports_withdraw,
        deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      ) VALUES (
        :code, 'Direct Crypto', true, true, false, true, false, 0,
        :depositMethods::jsonb,
        :withdrawMethods::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        supports_deposit = true,
        supports_withdraw = false,
        deposit_enabled = true,
        withdraw_enabled = false,
        deposit_methods_enabled = EXCLUDED.deposit_methods_enabled,
        withdraw_methods_enabled = EXCLUDED.withdraw_methods_enabled,
        updated_at = NOW()
    `, { code: PROVIDER, depositMethods, withdrawMethods });

    await q(`
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT spp.distributor_code, spp.store_code, :code,
        true, true, false, 0,
        :depositMethods::jsonb,
        :withdrawMethods::jsonb,
        NOW(), NOW()
      FROM store_payment_providers spp
      ON CONFLICT (distributor_code, store_code, provider_code) DO UPDATE SET
        enabled = true,
        deposit_enabled = true,
        withdraw_enabled = false,
        deposit_methods_enabled = EXCLUDED.deposit_methods_enabled,
        withdraw_methods_enabled = EXCLUDED.withdraw_methods_enabled,
        updated_at = NOW()
    `, { code: PROVIDER, depositMethods, withdrawMethods });

    await q(`
      INSERT INTO store_payment_providers (
        distributor_code, store_code, provider_code,
        enabled, deposit_enabled, withdraw_enabled, display_order,
        deposit_methods_enabled, withdraw_methods_enabled,
        created_at, updated_at
      )
      SELECT DISTINCT u.distributor_code, u.store_code, :code,
        true, true, false, 0,
        :depositMethods::jsonb,
        :withdrawMethods::jsonb,
        NOW(), NOW()
      FROM users u
      WHERE u.distributor_code IS NOT NULL
        AND u.store_code IS NOT NULL
      ON CONFLICT (distributor_code, store_code, provider_code) DO UPDATE SET
        enabled = true,
        deposit_enabled = true,
        withdraw_enabled = false,
        updated_at = NOW()
    `, { code: PROVIDER, depositMethods, withdrawMethods });
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET enabled = false,
          deposit_enabled = false,
          withdraw_enabled = false,
          updated_at = NOW()
      WHERE provider_code = 'selfcrypto'
        AND LOWER(REGEXP_REPLACE(COALESCE(store_code, ''), '[^a-z0-9]', '', 'g')) <> 'dragonfury'
      `,
      { transaction }
    );
  }
};
