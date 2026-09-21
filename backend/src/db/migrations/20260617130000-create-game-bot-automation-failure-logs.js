'use strict';

/**
 * Persistent audit log of bot automation failures per platform user / game / operation.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'game_bot_automation_failure_logs',
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
          allowNull: false,
          defaultValue: ''
        },
        platform_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'CASCADE'
        },
        operation_type: {
          type: Sequelize.STRING(32),
          allowNull: true
        },
        error_summary: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        game_username: {
          type: Sequelize.STRING(256),
          allowNull: true
        },
        external_response: {
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
    await q(
      'CREATE INDEX IF NOT EXISTS game_bot_automation_failure_logs_game_id_idx ON game_bot_automation_failure_logs (game_id)'
    );
    await q(
      'CREATE INDEX IF NOT EXISTS game_bot_automation_failure_logs_created_at_idx ON game_bot_automation_failure_logs (created_at)'
    );
    await q(
      'CREATE INDEX IF NOT EXISTS game_bot_automation_failure_logs_store_code_idx ON game_bot_automation_failure_logs (store_code)'
    );
    await q(
      'CREATE INDEX IF NOT EXISTS game_bot_automation_failure_logs_platform_user_id_idx ON game_bot_automation_failure_logs (platform_user_id)'
    );
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('game_bot_automation_failure_logs', { transaction });
  }
};
