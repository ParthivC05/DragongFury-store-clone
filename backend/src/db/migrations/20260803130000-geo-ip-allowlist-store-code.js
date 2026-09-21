'use strict';

/**
 * Scope geo IP allowlist entries by store_code.
 */
const TABLE = 'geo_ip_allowlist';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${TABLE}
      ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) NULL
    `);

    // Existing rows (if any) need a store before NOT NULL. Use a sentinel only if empty string left.
    await q(`
      UPDATE ${TABLE}
      SET store_code = 'unknown'
      WHERE store_code IS NULL OR TRIM(store_code) = ''
    `);

    await q(`
      ALTER TABLE ${TABLE}
      ALTER COLUMN store_code SET NOT NULL
    `);

    await q(`DROP INDEX IF EXISTS geo_ip_allowlist_ip_address_uidx`);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS geo_ip_allowlist_store_ip_uidx
      ON ${TABLE} (store_code, ip_address)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS geo_ip_allowlist_store_code_idx
      ON ${TABLE} (store_code)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`DROP INDEX IF EXISTS geo_ip_allowlist_store_ip_uidx`);
    await q(`DROP INDEX IF EXISTS geo_ip_allowlist_store_code_idx`);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS geo_ip_allowlist_ip_address_uidx
      ON ${TABLE} (ip_address)
    `);
    await q(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS store_code`);
  }
};
