'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS schema_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    await q(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS schema_type VARCHAR(32) NOT NULL DEFAULT 'BlogPosting'
    `);
    await q(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS schema_fields JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    await q(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS schema_custom TEXT
    `);
    await q(`
      CREATE TABLE IF NOT EXISTS page_schemas (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        page_key VARCHAR(64) NOT NULL,
        schema_enabled BOOLEAN NOT NULL DEFAULT true,
        schema_type VARCHAR(32) NOT NULL DEFAULT 'WebPage',
        schema_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        schema_custom TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (store_code, page_key)
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q('DROP TABLE IF EXISTS page_schemas');
    await q('ALTER TABLE blog_posts DROP COLUMN IF EXISTS schema_custom');
    await q('ALTER TABLE blog_posts DROP COLUMN IF EXISTS schema_fields');
    await q('ALTER TABLE blog_posts DROP COLUMN IF EXISTS schema_type');
    await q('ALTER TABLE blog_posts DROP COLUMN IF EXISTS schema_enabled');
  }
};
