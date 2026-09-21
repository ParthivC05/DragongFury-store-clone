'use strict';

/**
 * Logs each third-party bot API call attempt (success or error) for automation usage reporting.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'game_automation_api_logs',
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        game_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'games', key: 'id' },
          onDelete: 'CASCADE'
        },
        game_name: {
          type: Sequelize.STRING(128),
          allowNull: true
        },
        store_code: {
          type: Sequelize.STRING(64),
          allowNull: true
        },
        operation: {
          type: Sequelize.STRING(32),
          allowNull: false
        },
        api_endpoint: {
          type: Sequelize.STRING(256),
          allowNull: true
        },
        http_status: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        success: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      },
      { transaction }
    );

    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q('CREATE INDEX IF NOT EXISTS game_automation_api_logs_game_id_idx ON game_automation_api_logs (game_id)');
    await q('CREATE INDEX IF NOT EXISTS game_automation_api_logs_created_at_idx ON game_automation_api_logs (created_at)');
    await q('CREATE INDEX IF NOT EXISTS game_automation_api_logs_store_code_idx ON game_automation_api_logs (store_code)');
    await q('CREATE INDEX IF NOT EXISTS game_automation_api_logs_success_idx ON game_automation_api_logs (success)');
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('game_automation_api_logs', { transaction });
  }
};
