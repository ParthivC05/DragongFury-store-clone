'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS deposit_package_groups (
        id SERIAL PRIMARY KEY,
        distributor_code VARCHAR(64) NOT NULL,
        store_code VARCHAR(64) NOT NULL,
        group_key VARCHAR(32) NOT NULL,
        title VARCHAR(128) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS deposit_package_groups_store_key_uidx
      ON deposit_package_groups (distributor_code, store_code, group_key)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS deposit_packages (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES deposit_package_groups(id) ON DELETE CASCADE,
        distributor_code VARCHAR(64) NOT NULL,
        store_code VARCHAR(64) NOT NULL,
        title VARCHAR(128),
        final_sc DECIMAL(18, 2) NOT NULL,
        actual_price DECIMAL(18, 2) NOT NULL,
        final_price DECIMAL(18, 2) NOT NULL,
        discount_label VARCHAR(32),
        sort_order INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS deposit_packages_group_sort_idx
      ON deposit_packages (group_id, sort_order, id)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS deposit_packages_store_idx
      ON deposit_packages (distributor_code, store_code)
    `);

    await q(`
      ALTER TABLE chime_deposit_requests
      ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES deposit_packages(id) ON DELETE SET NULL
    `);

    await q(`
      ALTER TABLE chime_deposit_requests
      ADD COLUMN IF NOT EXISTS credit_sc DECIMAL(18, 2)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`ALTER TABLE chime_deposit_requests DROP COLUMN IF EXISTS credit_sc`);
    await q(`ALTER TABLE chime_deposit_requests DROP COLUMN IF EXISTS package_id`);
    await q(`DROP TABLE IF EXISTS deposit_packages`);
    await q(`DROP TABLE IF EXISTS deposit_package_groups`);
  }
};
