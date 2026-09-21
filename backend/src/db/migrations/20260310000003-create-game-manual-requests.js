'use strict';

/**
 * Create game_manual_requests table.
 * Stores pending manual game operations (register / deposit / redeem)
 * when a game's bot is offline and an admin needs to process them manually.
 * Idempotent: safe to run if the table already exists.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'game_manual_requests'`
    );
    if (tables.length > 0) return;

    await queryInterface.createTable('game_manual_requests', {
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
      request_type: {
        type: Sequelize.STRING(16),
        allowNull: false
        // 'register' | 'deposit' | 'redeem'
      },
      amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: true
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending'
        // 'pending' | 'approved' | 'rejected'
      },
      store_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      distributor_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      resolved_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      operation_done_by: {
        type: Sequelize.STRING(32),
        allowNull: true
      },
      game_username: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      game_password: {
        type: Sequelize.STRING(256),
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('game_manual_requests', ['user_id']);
    await queryInterface.addIndex('game_manual_requests', ['game_id']);
    await queryInterface.addIndex('game_manual_requests', ['status']);
    await queryInterface.addIndex('game_manual_requests', ['store_code']);
    await queryInterface.addIndex('game_manual_requests', ['distributor_code']);
    await queryInterface.addIndex('game_manual_requests', ['request_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('game_manual_requests');
  }
};
