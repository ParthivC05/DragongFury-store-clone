'use strict';

module.exports = function (sequelize, DataTypes) {
  const StorePaymentProvider = sequelize.define('StorePaymentProvider', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
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
    providerCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'provider_code'
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'enabled'
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
    tableName: 'store_payment_providers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['distributor_code', 'store_code', 'provider_code'] }
    ]
  });

  return StorePaymentProvider;
};
