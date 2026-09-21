'use strict';

/**
 * Store staff punching: shift allocation, daily check-in/out, and off-shift login requests.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [shiftTables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'store_staff_shifts'`
    );
    if (shiftTables.length === 0) {
      await queryInterface.createTable('store_staff_shifts', {
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
          allowNull: false
        },
        store_code: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        timezone: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        start_time: {
          type: Sequelize.STRING(5),
          allowNull: false
        },
        end_time: {
          type: Sequelize.STRING(5),
          allowNull: false
        },
        created_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        updated_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
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
      await queryInterface.addIndex('store_staff_shifts', ['user_id'], {
        unique: true,
        name: 'store_staff_shifts_user_id_uidx'
      });
      await queryInterface.addIndex('store_staff_shifts', ['store_code'], {
        name: 'store_staff_shifts_store_code_idx'
      });
    }

    const [attendanceTables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'store_staff_attendance'`
    );
    if (attendanceTables.length === 0) {
      await queryInterface.createTable('store_staff_attendance', {
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
          allowNull: false
        },
        store_code: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        shift_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'store_staff_shifts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        check_in_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        check_out_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        opening_balance: {
          type: Sequelize.DECIMAL(18, 2),
          allowNull: false
        },
        closing_balance: {
          type: Sequelize.DECIMAL(18, 2),
          allowNull: true
        },
        is_off_shift: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
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
      await queryInterface.addIndex('store_staff_attendance', ['user_id', 'check_in_at'], {
        name: 'store_staff_attendance_user_check_in_idx'
      });
      await queryInterface.addIndex('store_staff_attendance', ['store_code', 'check_in_at'], {
        name: 'store_staff_attendance_store_check_in_idx'
      });
    }

    const [requestTables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'store_staff_off_shift_requests'`
    );
    if (requestTables.length === 0) {
      await queryInterface.createTable('store_staff_off_shift_requests', {
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
          allowNull: false
        },
        store_code: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        status: {
          type: Sequelize.STRING(16),
          allowNull: false,
          defaultValue: 'pending'
        },
        valid_until: {
          type: Sequelize.DATE,
          allowNull: true
        },
        reviewed_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        reviewed_at: {
          type: Sequelize.DATE,
          allowNull: true
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
      await queryInterface.addIndex('store_staff_off_shift_requests', ['user_id', 'status'], {
        name: 'store_staff_off_shift_requests_user_status_idx'
      });
      await queryInterface.addIndex('store_staff_off_shift_requests', ['status', 'created_at'], {
        name: 'store_staff_off_shift_requests_status_created_idx'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('store_staff_off_shift_requests');
    await queryInterface.dropTable('store_staff_attendance');
    await queryInterface.dropTable('store_staff_shifts');
  }
};
