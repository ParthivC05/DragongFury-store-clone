'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE deposit_package_groups
      ADD COLUMN IF NOT EXISTS max_purchases_per_user INTEGER NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE deposit_package_groups
      DROP COLUMN IF EXISTS max_purchases_per_user
    `);
  }
};
