'use strict';

module.exports = function (sequelize, DataTypes) {
  const PaymentProvider = sequelize.define('PaymentProvider', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'code'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'name'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    supportsDeposit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'supports_deposit'
    },
    supportsWithdraw: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'supports_withdraw'
    },
    depositEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'deposit_enabled'
    },
    withdrawEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'withdraw_enabled'
    },
    displayOrder: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      defaultValue: 0,
      field: 'display_order'
    },
    depositMethodsEnabled: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'deposit_methods_enabled'
    },
    withdrawMethodsEnabled: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'withdraw_methods_enabled'
    }
  }, {
    sequelize,
    tableName: 'payment_providers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  return PaymentProvider;
};
