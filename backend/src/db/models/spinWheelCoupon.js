'use strict';

module.exports = function (sequelize, DataTypes) {
  const SpinWheelCoupon = sequelize.define(
    'SpinWheelCoupon',
    {
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
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'code'
      },
      discountPercent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: 'discount_percent'
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'issued',
        field: 'status'
      },
      spinTransactionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'spin_transaction_id'
      },
      depositRequestId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'deposit_request_id'
      },
      appliedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'applied_at'
      },
      redeemedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'redeemed_at'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'updated_at'
      }
    },
    {
      sequelize,
      tableName: 'spin_wheel_coupons',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  SpinWheelCoupon.associate = function (models) {
    if (models.User) {
      SpinWheelCoupon.belongsTo(models.User, { foreignKey: 'userId' });
    }
    if (models.UserTransaction) {
      SpinWheelCoupon.belongsTo(models.UserTransaction, { foreignKey: 'spinTransactionId' });
    }
  };

  return SpinWheelCoupon;
};
