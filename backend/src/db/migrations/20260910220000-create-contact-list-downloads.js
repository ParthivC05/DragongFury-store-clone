'use strict';

/**
 * Audit log for super-admin email / mobile number list CSV downloads.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'contact_list_downloads'`
    );
    if (tables.length > 0) return;

    await queryInterface.createTable('contact_list_downloads', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      downloaded_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      downloaded_by_email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      downloaded_by_username: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      list_type: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      store_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      distributor_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      verified_only: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      search: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      row_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.STRING(512),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    await queryInterface.addIndex('contact_list_downloads', ['created_at'], {
      name: 'contact_list_downloads_created_at_idx'
    });
    await queryInterface.addIndex('contact_list_downloads', ['list_type', 'created_at'], {
      name: 'contact_list_downloads_type_created_idx'
    });
    await queryInterface.addIndex('contact_list_downloads', ['downloaded_by_user_id'], {
      name: 'contact_list_downloads_by_user_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contact_list_downloads');
  }
};
