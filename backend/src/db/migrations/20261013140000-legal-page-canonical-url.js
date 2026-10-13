'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE legal_pages
      ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(1024)
    `);
    await q(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(1024)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`ALTER TABLE legal_pages DROP COLUMN IF EXISTS canonical_url`);
    await q(`ALTER TABLE footer_pages DROP COLUMN IF EXISTS canonical_url`);
  }
};
