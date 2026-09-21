'use strict';

/**
 * Platform-wide IP allowlist for geo-blocking bypass.
 * Entries are managed from the partner platform admin panel.
 */
const TABLE = 'geo_ip_allowlist';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        ip_address VARCHAR(64) NOT NULL,
        note VARCHAR(255) NULL,
        created_by_user_id INTEGER NULL REFERENCES users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS geo_ip_allowlist_ip_address_uidx
      ON ${TABLE} (ip_address)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS geo_ip_allowlist_created_by_user_id_idx
      ON ${TABLE} (created_by_user_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS ${TABLE}`);
  }
};
