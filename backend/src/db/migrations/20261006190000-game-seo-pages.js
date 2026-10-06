'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS game_seo_pages (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        genre VARCHAR(128),
        catalog_name VARCHAR(255),
        default_image VARCHAR(512),
        image_url VARCHAR(1024),
        hero_lead TEXT,
        hero_blurb TEXT,
        buttons JSONB,
        sections JSONB,
        meta_title VARCHAR(512),
        meta_description TEXT,
        meta_tags VARCHAR(1024),
        canonical_url VARCHAR(1024),
        allow_index BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (store_code, slug)
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q('DROP TABLE IF EXISTS game_seo_pages');
  }
};
