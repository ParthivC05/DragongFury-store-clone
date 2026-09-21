'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_title VARCHAR(512) NULL`);
    await q(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description TEXT NULL`);
    await q(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_tags VARCHAR(1024) NULL`);

    await q(`ALTER TABLE footer_pages ADD COLUMN IF NOT EXISTS meta_title VARCHAR(512) NULL`);
    await q(`ALTER TABLE footer_pages ADD COLUMN IF NOT EXISTS meta_description TEXT NULL`);
    await q(`ALTER TABLE footer_pages ADD COLUMN IF NOT EXISTS meta_tags VARCHAR(1024) NULL`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS meta_title`);
    await q(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS meta_description`);
    await q(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS meta_tags`);
    await q(`ALTER TABLE footer_pages DROP COLUMN IF EXISTS meta_title`);
    await q(`ALTER TABLE footer_pages DROP COLUMN IF EXISTS meta_description`);
    await q(`ALTER TABLE footer_pages DROP COLUMN IF EXISTS meta_tags`);
  }
};
