'use strict';

/**
 * Add operation_done_by_user_id to game_activities so we can show
 * the store partner or admin name in game logs (who performed the operation).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'game_activities' AND column_name = 'operation_done_by_user_id'`
    );
    if (cols.length > 0) return;

    await queryInterface.addColumn('game_activities', 'operation_done_by_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'user_id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('game_activities', 'operation_done_by_user_id');
  }
};
