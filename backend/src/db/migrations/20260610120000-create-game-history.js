'use strict';

/**
 * Audit trail for all admin-side game configuration changes.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'game_history',
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        game_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'games', key: 'id' },
          onDelete: 'SET NULL'
        },
        game_name: {
          type: Sequelize.STRING(128),
          allowNull: true
        },
        store_code: {
          type: Sequelize.STRING(64),
          allowNull: true
        },
        action: {
          type: Sequelize.STRING(32),
          allowNull: false
        },
        field_name: {
          type: Sequelize.STRING(64),
          allowNull: true
        },
        old_value: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        new_value: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        changed_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'SET NULL'
        },
        changed_by_name: {
          type: Sequelize.STRING(256),
          allowNull: true
        },
        changed_by_role: {
          type: Sequelize.STRING(32),
          allowNull: true
        },
        trigger_source: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'admin_panel'
        },
        details: {
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
    await q('CREATE INDEX IF NOT EXISTS game_history_game_id_idx ON game_history (game_id)');
    await q('CREATE INDEX IF NOT EXISTS game_history_created_at_idx ON game_history (created_at)');
    await q('CREATE INDEX IF NOT EXISTS game_history_store_code_idx ON game_history (store_code)');
    await q('CREATE INDEX IF NOT EXISTS game_history_action_idx ON game_history (action)');
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('game_history', { transaction });
  }
};
