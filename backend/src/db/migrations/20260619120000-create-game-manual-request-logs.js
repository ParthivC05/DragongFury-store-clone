'use strict';

/**
 * Audit log for manual register request approvals and credential updates.
 * Idempotent: safe to re-run if the table or indexes already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'game_manual_request_logs'`,
      { transaction }
    );

    if (tables.length === 0) {
      await queryInterface.createTable(
        'game_manual_request_logs',
        {
          id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false
          },
          manual_request_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'game_manual_requests', key: 'id' },
            onDelete: 'CASCADE'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'CASCADE'
          },
          game_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'games', key: 'id' },
            onDelete: 'CASCADE'
          },
          action_type: {
            type: Sequelize.STRING(32),
            allowNull: false
            // register_approved | credentials_updated
          },
          game_username: {
            type: Sequelize.STRING(128),
            allowNull: true
          },
          game_password: {
            type: Sequelize.STRING(256),
            allowNull: true
          },
          previous_game_username: {
            type: Sequelize.STRING(128),
            allowNull: true
          },
          previous_game_password: {
            type: Sequelize.STRING(256),
            allowNull: true
          },
          performed_by_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'SET NULL'
          },
          operation_done_by: {
            type: Sequelize.STRING(32),
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
    }

    await q('CREATE INDEX IF NOT EXISTS game_manual_request_logs_manual_request_id_idx ON game_manual_request_logs (manual_request_id)');
    await q('CREATE INDEX IF NOT EXISTS game_manual_request_logs_created_at_idx ON game_manual_request_logs (created_at)');
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('game_manual_request_logs', { transaction });
  }
};
