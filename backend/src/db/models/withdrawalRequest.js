'use strict';

module.exports = function (sequelize, DataTypes) {
  const WithdrawalRequest = sequelize.define('WithdrawalRequest', {
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
    linkedAccountId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'linked_account_id'
    },
    cryptoAddress: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'crypto_address'
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'currency'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'reason'
    },
    routingType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'routing_type'
    },
    gameName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'game_name'
    },
    gameUsername: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'game_username'
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    },
    paymentApiRequestId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'payment_api_request_id'
    },
    approvedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'approved_by_user_id',
      references: { model: 'users', key: 'user_id' }
    }
  }, {
    sequelize,
    tableName: 'withdrawal_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  WithdrawalRequest.associate = function (models) {
    if (models.User) {
      WithdrawalRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
      WithdrawalRequest.belongsTo(models.User, { foreignKey: 'approvedByUserId', as: 'ApprovedByUser' });
    }
  };

  return WithdrawalRequest;
};
