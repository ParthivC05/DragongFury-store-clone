'use strict';

/**
 * Optional logo + banner for global campaign email template.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE email_campaigns
        ADD COLUMN IF NOT EXISTS logo_url TEXT NULL,
        ADD COLUMN IF NOT EXISTS banner_url TEXT NULL;
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE email_campaigns
        DROP COLUMN IF EXISTS logo_url,
        DROP COLUMN IF EXISTS banner_url;
    `);
  }
};
