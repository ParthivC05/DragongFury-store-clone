'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('store_subscriptions', { transaction });
    if (table.extended_at) return;
    await queryInterface.addColumn(
      'store_subscriptions',
      'extended_at',
      { type: Sequelize.DATE, allowNull: true },
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('store_subscriptions', { transaction });
    if (!table.extended_at) return;
    await queryInterface.removeColumn('store_subscriptions', 'extended_at', { transaction });
  }
};
