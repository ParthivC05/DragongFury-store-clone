'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE page_schemas
      ADD COLUMN IF NOT EXISTS meta_title VARCHAR(512) NULL
    `);
    await q(`
      ALTER TABLE page_schemas
      ADD COLUMN IF NOT EXISTS meta_description TEXT NULL
    `);
    await q(`
      ALTER TABLE page_schemas
      ADD COLUMN IF NOT EXISTS meta_tags VARCHAR(1024) NULL
    `);
    await q(`
      ALTER TABLE page_schemas
      ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(1024) NULL
    `);
    await q(`
      ALTER TABLE page_schemas
      ADD COLUMN IF NOT EXISTS allow_index BOOLEAN NOT NULL DEFAULT TRUE
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q('ALTER TABLE page_schemas DROP COLUMN IF EXISTS allow_index');
    await q('ALTER TABLE page_schemas DROP COLUMN IF EXISTS canonical_url');
    await q('ALTER TABLE page_schemas DROP COLUMN IF EXISTS meta_tags');
    await q('ALTER TABLE page_schemas DROP COLUMN IF EXISTS meta_description');
    await q('ALTER TABLE page_schemas DROP COLUMN IF EXISTS meta_title');
  }
};
