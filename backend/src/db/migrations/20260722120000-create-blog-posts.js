'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        title VARCHAR(512) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        category VARCHAR(128),
        title_image VARCHAR(1024),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_store_slug_uidx
      ON blog_posts (store_code, slug)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS blog_posts_store_active_idx
      ON blog_posts (store_code, is_active, created_at DESC)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS blog_posts_store_category_idx
      ON blog_posts (store_code, category)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS blog_posts`);
  }
};
