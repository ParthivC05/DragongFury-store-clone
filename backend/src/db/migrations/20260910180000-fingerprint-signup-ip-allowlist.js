'use strict';

/**
 * Admin-managed IPs that skip the one-account-per-device signup block.
 */
const TABLE = 'fingerprint_signup_ip_allowlist';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        ip_address VARCHAR(64) NOT NULL,
        note VARCHAR(255) NULL,
        created_by_user_id INTEGER NULL REFERENCES users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS fingerprint_signup_ip_allowlist_store_ip_uidx
      ON ${TABLE} (store_code, ip_address)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS fingerprint_signup_ip_allowlist_store_code_idx
      ON ${TABLE} (store_code)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS fingerprint_signup_ip_allowlist_created_by_user_id_idx
      ON ${TABLE} (created_by_user_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS ${TABLE}`);
  }
};
