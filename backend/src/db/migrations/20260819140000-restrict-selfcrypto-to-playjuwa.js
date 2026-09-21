'use strict';

/**
 * Direct Crypto is DragonFury-only. Turn it off everywhere else if the
 * original seed enabled it for all stores.
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
      UPDATE store_payment_providers
      SET enabled = false,
          deposit_enabled = false,
          withdraw_enabled = false,
          updated_at = NOW()
      WHERE provider_code = :code
        AND LOWER(REGEXP_REPLACE(COALESCE(store_code, ''), '[^a-z0-9]', '', 'g')) <> 'dragonfury'
    `, { code: PROVIDER });

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
      WHERE LOWER(REGEXP_REPLACE(COALESCE(spp.store_code, ''), '[^a-z0-9]', '', 'g')) = 'dragonfury'
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
      SET enabled = true, deposit_enabled = true, updated_at = NOW()
      WHERE provider_code = 'selfcrypto'
      `,
      { transaction }
    );
  }
};
