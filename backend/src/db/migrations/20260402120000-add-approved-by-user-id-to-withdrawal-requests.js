'use strict';

/**
 * Who approved or rejected a legacy withdrawal_requests row (platform / payment flow).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'approved_by_user_id'`
    );
    if (cols.length > 0) return;

    await queryInterface.addColumn('withdrawal_requests', 'approved_by_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'user_id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addIndex('withdrawal_requests', ['approved_by_user_id'], {
      name: 'idx_withdrawal_requests_approved_by_user_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('withdrawal_requests', 'idx_withdrawal_requests_approved_by_user_id').catch(() => {});
    await queryInterface.removeColumn('withdrawal_requests', 'approved_by_user_id').catch(() => {});
  }
};
