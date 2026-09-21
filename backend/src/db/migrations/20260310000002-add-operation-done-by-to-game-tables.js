'use strict';

/**
 * Add operation_done_by to game_activities and user_game_accounts.
 * Tracks whether a game operation was handled by the bot (automation)
 * or manually by a store_admin, distributor_admin, or master_admin.
 * Idempotent: safe to run if columns already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [activitiesCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'game_activities' AND column_name = 'operation_done_by'`
    );
    if (activitiesCol.length === 0) {
      await queryInterface.addColumn('game_activities', 'operation_done_by', {
        type: Sequelize.STRING(32),
        allowNull: true
      });
    }

    const [accountsCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user_game_accounts' AND column_name = 'operation_done_by'`
    );
    if (accountsCol.length === 0) {
      await queryInterface.addColumn('user_game_accounts', 'operation_done_by', {
        type: Sequelize.STRING(32),
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('game_activities', 'operation_done_by');
    await queryInterface.removeColumn('user_game_accounts', 'operation_done_by');
  }
};
