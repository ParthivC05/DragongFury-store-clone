'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;

    await queryInterface.sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS legal_pages (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        page_key VARCHAR(64) NOT NULL,
        title VARCHAR(512) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        meta_title VARCHAR(512) NULL,
        meta_description TEXT NULL,
        meta_tags VARCHAR(1024) NULL,
        allow_index BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS legal_pages_store_code_page_key_uq
      ON legal_pages (store_code, page_key)
      `,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS legal_pages', { transaction });
  }
};
