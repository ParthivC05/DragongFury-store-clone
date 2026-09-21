'use strict';

/**
 * Self-hosted crypto rail (native BTC / ETH / TRX / SOL + Lightning).
 * Speed (scrypto) is unchanged. Deposits only. DragonFury only — other stores stay off.
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
      CREATE TABLE IF NOT EXISTS selfcrypto_hd_counters (
        chain VARCHAR(16) PRIMARY KEY,
        next_index INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      INSERT INTO selfcrypto_hd_counters (chain, next_index, updated_at)
      VALUES
        ('btc', 0, NOW()),
        ('eth', 0, NOW()),
        ('trx', 0, NOW()),
        ('sol', 0, NOW())
      ON CONFLICT (chain) DO NOTHING
    `);

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
      WHERE LOWER(REGEXP_REPLACE(COALESCE(spp.store_code, ''), '[^a-z0-9]', '', 'g')) = 'dragonfury'
      ON CONFLICT (distributor_code, store_code, provider_code) DO NOTHING
    `, { code: PROVIDER, depositMethods, withdrawMethods });
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DELETE FROM store_payment_providers WHERE provider_code = 'selfcrypto'`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `DELETE FROM payment_providers WHERE code = 'selfcrypto'`,
      { transaction }
    );
    await queryInterface.dropTable('selfcrypto_hd_counters', { transaction });
  }
};
