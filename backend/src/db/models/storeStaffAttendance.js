'use strict';

module.exports = function (sequelize, DataTypes) {
  const StoreStaffAttendance = sequelize.define('StoreStaffAttendance', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id'
    },
    distributorCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'distributor_code'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'store_code'
    },
    shiftId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'shift_id'
    },
    checkInAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'check_in_at'
    },
    checkOutAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'check_out_at'
    },
    openingBalance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'opening_balance'
    },
    closingBalance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'closing_balance'
    },
    isOffShift: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_off_shift'
    }
  }, {
    sequelize,
    tableName: 'store_staff_attendance',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  StoreStaffAttendance.associate = function (models) {
    if (models.User) {
      StoreStaffAttendance.belongsTo(models.User, { foreignKey: 'userId', as: 'StaffUser' });
    }
    if (models.StoreStaffShift) {
      StoreStaffAttendance.belongsTo(models.StoreStaffShift, { foreignKey: 'shiftId', as: 'Shift' });
    }
  };

  return StoreStaffAttendance;
};
