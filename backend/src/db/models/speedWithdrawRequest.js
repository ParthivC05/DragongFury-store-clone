'use strict';

/**
 * Speed LNURL withdraw-request record (in-app flow: QR + timer).
 * status: active | paid | deactivated
 */
module.exports = function (sequelize, DataTypes) {
  const SpeedWithdrawRequest = sequelize.define('SpeedWithdrawRequest', {
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
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'scrypto',
      field: 'provider'
    },
    providerReference: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'provider_reference'
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'withdraw',
      field: 'type'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      field: 'amount'
    },
    currency: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'currency'
    },
    targetCurrency: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: 'target_currency'
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      field: 'exchange_rate'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'active',
      field: 'status'
    },
    withdrawRequest: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'withdraw_request'
    },
    ttl: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'ttl'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    providerPayloadRaw: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_payload_raw'
    },
    claimedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'claimed_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    deactivatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deactivated_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'speed_withdraw_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  SpeedWithdrawRequest.associate = function (models) {
    if (models.User) {
      SpeedWithdrawRequest.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return SpeedWithdrawRequest;
};
