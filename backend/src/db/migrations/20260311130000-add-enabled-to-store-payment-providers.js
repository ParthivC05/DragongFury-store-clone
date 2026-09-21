'use strict';

/**
 * Add enabled to store_payment_providers. When false, provider is off for that store's users (deposit and withdraw hidden).
 */
const TABLE = 'store_payment_providers';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${TABLE}
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn(TABLE, 'enabled', { transaction }).catch(() => {});
  }
};
