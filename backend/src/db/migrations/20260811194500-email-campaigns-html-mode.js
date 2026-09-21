'use strict';

/**
 * Add HTML email mode fields for DragonFury email campaigns.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE email_campaigns
        ADD COLUMN IF NOT EXISTS content_mode VARCHAR(16) NOT NULL DEFAULT 'blocks',
        ADD COLUMN IF NOT EXISTS body_html TEXT NULL;
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE email_campaigns
        DROP COLUMN IF EXISTS body_html,
        DROP COLUMN IF EXISTS content_mode;
    `);
  }
};
