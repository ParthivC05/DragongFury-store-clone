'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS payment_api_password_encrypted TEXT
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'payment_api_password_encrypted', { transaction }).catch(() => {});
  }
};
