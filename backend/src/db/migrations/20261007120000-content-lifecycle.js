'use strict';

const TABLES = ['blog_posts', 'footer_pages', 'footer_menus', 'game_seo_pages'];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    for (const table of TABLES) {
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS permanent_redirect VARCHAR(1024)`);
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by_id INTEGER`);
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by_name VARCHAR(255)`);
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ`);
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS restored_by_id INTEGER`);
      await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS restored_by_name VARCHAR(255)`);
    }
  },

  async down() {
    /* Keep audit columns. Dropping them would erase who deleted or restored a page. */
  }
};
