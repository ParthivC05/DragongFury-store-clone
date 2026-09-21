'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS payment_api_email VARCHAR(255)
    `);
    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS payment_account_created_by_platform BOOLEAN DEFAULT FALSE
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'payment_api_email', { transaction }).catch(() => {});
    await queryInterface.removeColumn('users', 'payment_account_created_by_platform', { transaction }).catch(() => {});
  }
};
