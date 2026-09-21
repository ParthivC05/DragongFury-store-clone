'use strict';

module.exports = function (sequelize, DataTypes) {
  const PaymentDepositCompletion = sequelize.define('PaymentDepositCompletion', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'orionstarspay',
      field: 'provider'
    },
    transactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
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
      allowNull: false,
      field: 'amount'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'payment_deposit_completions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['provider', 'transaction_id'], name: 'payment_deposit_completions_provider_transaction_id' }
    ]
  });

  PaymentDepositCompletion.associate = function (models) {
    if (models.User) {
      PaymentDepositCompletion.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return PaymentDepositCompletion;
};
