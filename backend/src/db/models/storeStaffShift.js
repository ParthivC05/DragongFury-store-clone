'use strict';

module.exports = function (sequelize, DataTypes) {
  const StoreStaffShift = sequelize.define('StoreStaffShift', {
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
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    startTime: {
      type: DataTypes.STRING(5),
      allowNull: false,
      field: 'start_time'
    },
    endTime: {
      type: DataTypes.STRING(5),
      allowNull: false,
      field: 'end_time'
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by_user_id'
    },
    updatedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'updated_by_user_id'
    }
  }, {
    sequelize,
    tableName: 'store_staff_shifts',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  StoreStaffShift.associate = function (models) {
    if (models.User) {
      StoreStaffShift.belongsTo(models.User, { foreignKey: 'userId', as: 'StaffUser' });
    }
    if (models.StoreStaffAttendance) {
      StoreStaffShift.hasMany(models.StoreStaffAttendance, { foreignKey: 'shiftId' });
    }
  };

  return StoreStaffShift;
};
