'use strict';

module.exports = function (sequelize, DataTypes) {
  const DepositRequest = sequelize.define('DepositRequest', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
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
    method: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'method'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'completed',
      field: 'status'
    },
    provider: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'provider'
    },
    providerTransactionId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'provider_transaction_id'
    },
    cryptoCurrency: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'crypto_currency'
    },
    txHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'tx_hash'
    }
  }, {
    sequelize,
    tableName: 'deposit_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  DepositRequest.associate = function (models) {
    if (models.User) {
      DepositRequest.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return DepositRequest;
};
