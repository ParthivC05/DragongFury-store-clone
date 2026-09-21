'use strict';

module.exports = function (sequelize, DataTypes) {
  const StoreStaffOffShiftRequest = sequelize.define('StoreStaffOffShiftRequest', {
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
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'pending'
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'valid_until'
    },
    reviewedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'reviewed_by_user_id'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    }
  }, {
    sequelize,
    tableName: 'store_staff_off_shift_requests',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  StoreStaffOffShiftRequest.associate = function (models) {
    if (models.User) {
      StoreStaffOffShiftRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'StaffUser' });
      StoreStaffOffShiftRequest.belongsTo(models.User, { foreignKey: 'reviewedByUserId', as: 'ReviewedByUser' });
    }
  };

  return StoreStaffOffShiftRequest;
};
