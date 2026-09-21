'use strict';

/** Idempotent: safe to re-run if the table or indexes already exist. */
module.exports = {
  up: async (queryInterface, Sequelize, opts = {}) => {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'user_game_credential_histories'`,
      { transaction }
    );

    if (tables.length === 0) {
      await queryInterface.createTable(
        'user_game_credential_histories',
        {
          id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          game_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'games', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          action: {
            type: Sequelize.STRING(32),
            allowNull: false
          },
          old_username: {
            type: Sequelize.STRING(128),
            allowNull: true
          },
          old_password: {
            type: Sequelize.STRING(256),
            allowNull: true
          },
          new_username: {
            type: Sequelize.STRING(128),
            allowNull: true
          },
          new_password: {
            type: Sequelize.STRING(256),
            allowNull: true
          },
          performed_by_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
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

    await q('CREATE INDEX IF NOT EXISTS user_game_credential_histories_user_id ON user_game_credential_histories (user_id)');
    await q('CREATE INDEX IF NOT EXISTS user_game_credential_histories_game_id ON user_game_credential_histories (game_id)');
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('user_game_credential_histories');
  }
};
