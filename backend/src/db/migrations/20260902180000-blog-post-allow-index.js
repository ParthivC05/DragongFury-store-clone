'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS allow_index BOOLEAN NOT NULL DEFAULT TRUE
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`ALTER TABLE blog_posts DROP COLUMN IF EXISTS allow_index`);
  }
};
