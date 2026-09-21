'use strict';

/**
 * Add billing_type, flat_amount_cents, percentage_value, percentage_base to subscriptions.
 * Uses IF NOT EXISTS so migration is safe when columns already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS billing_type VARCHAR(32) NOT NULL DEFAULT 'flat',
      ADD COLUMN IF NOT EXISTS flat_amount_cents INTEGER NULL,
      ADD COLUMN IF NOT EXISTS percentage_value DECIMAL(5, 2) NULL,
      ADD COLUMN IF NOT EXISTS percentage_base VARCHAR(32) NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('subscriptions', 'percentage_base', { transaction }).catch(() => {});
    await queryInterface.removeColumn('subscriptions', 'percentage_value', { transaction }).catch(() => {});
    await queryInterface.removeColumn('subscriptions', 'flat_amount_cents', { transaction }).catch(() => {});
    await queryInterface.removeColumn('subscriptions', 'billing_type', { transaction }).catch(() => {});
  }
};
