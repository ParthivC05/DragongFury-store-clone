'use strict';

/**
 * One welcome_signup credit per user — prevents race double-grant.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS user_transactions_welcome_signup_once_uq
       ON user_transactions (user_id)
       WHERE type = 'welcome_signup'`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS user_transactions_welcome_signup_once_uq`,
      { transaction }
    );
  }
};
