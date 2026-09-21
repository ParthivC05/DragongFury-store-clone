'use strict';

/**
 * Add deposit_enabled and withdraw_enabled to payment_providers.
 * Master admin can toggle deposit and withdraw per provider independently.
 */
const TABLE = 'payment_providers';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${TABLE}
      ADD COLUMN IF NOT EXISTS deposit_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS withdraw_enabled BOOLEAN NOT NULL DEFAULT true
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn(TABLE, 'deposit_enabled', { transaction }).catch(() => {});
    await queryInterface.removeColumn(TABLE, 'withdraw_enabled', { transaction }).catch(() => {});
  }
};
