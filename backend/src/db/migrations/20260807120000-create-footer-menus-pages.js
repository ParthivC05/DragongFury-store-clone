'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS footer_menus (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        label VARCHAR(255) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS footer_menus_store_sort_idx
      ON footer_menus (store_code, sort_order ASC, id ASC)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS footer_pages (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        menu_id INTEGER NOT NULL REFERENCES footer_menus(id) ON DELETE CASCADE,
        title VARCHAR(512) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS footer_pages_store_slug_uidx
      ON footer_pages (store_code, slug)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS footer_pages_menu_sort_idx
      ON footer_pages (menu_id, sort_order ASC, id ASC)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS footer_pages_store_active_idx
      ON footer_pages (store_code, is_active)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS footer_pages`);
    await q(`DROP TABLE IF EXISTS footer_menus`);
  }
};
