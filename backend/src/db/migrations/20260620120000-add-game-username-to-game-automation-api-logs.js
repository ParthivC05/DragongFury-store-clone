'use strict';

/**
 * Store the game username targeted by each third-party bot API call.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('game_automation_api_logs', { transaction });
    if (!table.game_username) {
      await queryInterface.addColumn(
        'game_automation_api_logs',
        'game_username',
        {
          type: Sequelize.STRING(128),
          allowNull: true
        },
        { transaction }
      );
    }
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    const table = await queryInterface.describeTable('game_automation_api_logs', { transaction });
    if (table.game_username) {
      await queryInterface.removeColumn('game_automation_api_logs', 'game_username', { transaction });
    }
  }
};
