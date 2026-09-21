'use strict';

/**
 * Store which Chime $cashtag staff paid from when approving a manual withdrawal.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('chime_cashapp_withdrawal_requests', { transaction });
    if (!table.paid_from_tag) {
      await queryInterface.addColumn(
        'chime_cashapp_withdrawal_requests',
        'paid_from_tag',
        { type: Sequelize.STRING(255), allowNull: true },
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('chime_cashapp_withdrawal_requests', { transaction });
    if (table.paid_from_tag) {
      await queryInterface.removeColumn('chime_cashapp_withdrawal_requests', 'paid_from_tag', { transaction });
    }
  }
};
