'use strict';

module.exports = function (sequelize, DataTypes) {
  const PaymentTransaction = sequelize.define('PaymentTransaction', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    transactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: 'transaction_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' },
      field: 'user_id'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'amount'
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'currency'
    },
    status: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'status'
    },
    eventType: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'event_type'
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'raw_payload'
    }
  }, {
    sequelize,
    tableName: 'payment_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  PaymentTransaction.associate = function (models) {
    if (models.User) {
      PaymentTransaction.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return PaymentTransaction;
};
