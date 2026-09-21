'use strict';

/**
 * Pending deposit session for in-app payment modal.
 * status: 'pending' | 'confirming' | 'completed' | 'failed' | 'expired'
 * Speed POST /payments: walletAddress = on-chain/ethereum/solana address; paymentRequest = Lightning BOLT11; paymentUri kept for backward compatibility.
 */
module.exports = function (sequelize, DataTypes) {
  const PaymentPendingDeposit = sequelize.define('PaymentPendingDeposit', {
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
    paymentLink: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'payment_link'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending',
      field: 'status'
    },
    provider: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'provider'
    },
    providerSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'provider_session_id'
    },
    providerMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_metadata'
    },
    assetCode: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'asset_code'
    },
    network: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'network'
    },
    qrCodeUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'qr_code_url'
    },
    walletAddress: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'wallet_address'
    },
    paymentUri: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'payment_uri'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    targetCurrency: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'target_currency'
    },
    paymentMethod: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'payment_method'
    },
    targetAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      field: 'target_amount'
    },
    paymentRequest: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'payment_request'
    },
    ttl: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'ttl'
    },
    rawProviderResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'raw_provider_response'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'payment_pending_deposits',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  PaymentPendingDeposit.associate = function (models) {
    if (models.User) {
      PaymentPendingDeposit.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return PaymentPendingDeposit;
};
