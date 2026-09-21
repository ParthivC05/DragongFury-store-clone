'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('store_subscription_requests', { transaction });
    if (!table.approved_period_starts_at) {
      await queryInterface.addColumn(
        'store_subscription_requests',
        'approved_period_starts_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction }
      );
    }
    if (!table.approved_period_ends_at) {
      await queryInterface.addColumn(
        'store_subscription_requests',
        'approved_period_ends_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('store_subscription_requests', { transaction });
    if (table.approved_period_ends_at) {
      await queryInterface.removeColumn('store_subscription_requests', 'approved_period_ends_at', { transaction });
    }
    if (table.approved_period_starts_at) {
      await queryInterface.removeColumn('store_subscription_requests', 'approved_period_starts_at', { transaction });
    }
  }
};
