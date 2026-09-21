'use strict';

/**
 * Audit log when a game switches from automation to manual mode
 * (automation API failure or admin toggled bot_offline).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'game_manual_mode_logs',
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
        game_store_username: {
          type: Sequelize.STRING(256),
          allowNull: true
        },
        game_store_password: {
          type: Sequelize.STRING(256),
          allowNull: true
        },
        automation_api_error: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        switched_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'SET NULL'
        },
        switched_by_name: {
          type: Sequelize.STRING(256),
          allowNull: true
        },
        trigger_source: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'automation_failure'
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
    await q('CREATE INDEX IF NOT EXISTS game_manual_mode_logs_game_id_idx ON game_manual_mode_logs (game_id)');
    await q('CREATE INDEX IF NOT EXISTS game_manual_mode_logs_created_at_idx ON game_manual_mode_logs (created_at)');
    await q('CREATE INDEX IF NOT EXISTS game_manual_mode_logs_store_code_idx ON game_manual_mode_logs (store_code)');
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('game_manual_mode_logs', { transaction });
  }
};
