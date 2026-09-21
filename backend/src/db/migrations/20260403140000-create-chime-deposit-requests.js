'use strict';

/**
 * Chime manual deposit requests: player submits amount + source handle;
 * store admin credits Standard SC after confirming payment (same workflow pattern as manual withdrawal).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'chime_deposit_requests'`
    );
    if (tables.length > 0) return;

    await queryInterface.createTable('chime_deposit_requests', {
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
      distributor_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      store_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      deposit_type: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(8),
        allowNull: true
      },
      source_username: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'pending'
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      approved_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'SET NULL',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    await queryInterface.addIndex('chime_deposit_requests', ['status'], { name: 'idx_chime_deposit_requests_status' });
    await queryInterface.addIndex('chime_deposit_requests', ['store_code'], { name: 'idx_chime_deposit_requests_store_code' });
    await queryInterface.addIndex('chime_deposit_requests', ['distributor_code'], { name: 'idx_chime_deposit_requests_distributor_code' });
    await queryInterface.addIndex('chime_deposit_requests', ['user_id'], { name: 'idx_chime_deposit_requests_user_id' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('chime_deposit_requests');
  }
};
