'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('chime_cashapp_withdrawal_requests', { transaction });
    if (!table.approved_at) {
      await queryInterface.addColumn(
        'chime_cashapp_withdrawal_requests',
        'approved_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction }
      );
      // Existing completed rows used updated_at as the approval time
      await queryInterface.sequelize.query(
        `UPDATE chime_cashapp_withdrawal_requests
         SET approved_at = updated_at
         WHERE status = 'completed' AND approved_at IS NULL`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('chime_cashapp_withdrawal_requests', { transaction });
    if (table.approved_at) {
      await queryInterface.removeColumn('chime_cashapp_withdrawal_requests', 'approved_at', { transaction });
    }
  }
};
