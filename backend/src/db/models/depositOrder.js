'use strict';

module.exports = function (sequelize, DataTypes) {
  const DepositOrder = sequelize.define('DepositOrder', {
    id: {
      type: DataTypes.BIGINT,
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
    provider: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'orionstarspay',
      field: 'provider'
    },
    requestedAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'requested_amount'
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'USD',
      field: 'currency'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'PENDING',
      field: 'status'
    },
    paymentLinkUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'payment_link_url'
    },
    paymentLinkToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'payment_link_token'
    },
    providerApplicationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'provider_application_id'
    },
    providerTransactionId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'provider_transaction_id'
    },
    linkExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'link_expires_at'
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_synced_at'
    },
    syncAttemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sync_attempt_count'
    },
    lastSyncError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_sync_error'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'metadata'
    }
  }, {
    sequelize,
    tableName: 'deposit_orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  DepositOrder.associate = function (models) {
    if (models.User) {
      DepositOrder.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return DepositOrder;
};
