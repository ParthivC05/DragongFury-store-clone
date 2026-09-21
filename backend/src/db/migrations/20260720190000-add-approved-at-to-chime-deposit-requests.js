'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('chime_deposit_requests', { transaction });
    if (!table.approved_at) {
      await queryInterface.addColumn(
        'chime_deposit_requests',
        'approved_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE chime_deposit_requests
         SET approved_at = updated_at
         WHERE status = 'completed' AND approved_at IS NULL`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('chime_deposit_requests', { transaction });
    if (table.approved_at) {
      await queryInterface.removeColumn('chime_deposit_requests', 'approved_at', { transaction });
    }
  }
};
