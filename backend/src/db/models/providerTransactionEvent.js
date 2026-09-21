'use strict';

module.exports = function (sequelize, DataTypes) {
  const ProviderTransactionEvent = sequelize.define('ProviderTransactionEvent', {
    id: {
      type: DataTypes.BIGINT,
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
    providerTransactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: 'provider_transaction_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' },
      field: 'user_id'
    },
    paymentLinkToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'payment_link_token'
    },
    eventType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'event_type'
    },
    providerStatus: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'provider_status'
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
    method: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'method'
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'raw_payload'
    },
    seenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'seen_at'
    }
  }, {
    sequelize,
    tableName: 'provider_transaction_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  ProviderTransactionEvent.associate = function (models) {
    if (models.User) {
      ProviderTransactionEvent.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return ProviderTransactionEvent;
};
