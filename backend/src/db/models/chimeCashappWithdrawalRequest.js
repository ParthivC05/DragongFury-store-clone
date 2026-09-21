'use strict';

module.exports = function (sequelize, DataTypes) {
  const ChimeCashappWithdrawalRequest = sequelize.define('ChimeCashappWithdrawalRequest', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    distributorCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'distributor_code'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    payoutType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'payout_type'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: true
    },
    destinationUsername: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'destination_username'
    },
    paymentProvider: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'payment_provider'
    },
    outerOrderSn: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'outer_order_sn'
    },
    providerTransactionId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'provider_transaction_id'
    },
    dollarpayMerchantId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'dollarpay_merchant_id'
    },
    dollarpayKeyEncrypted: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dollarpay_key_encrypted'
    },
    destinationMeta: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'destination_meta'
    },
    xxpayBaseUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'xxpay_base_url'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending'
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    },
    approvedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'approved_by_user_id'
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at'
    },
    paidFromTag: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'paid_from_tag'
    }
  }, {
    sequelize,
    tableName: 'chime_cashapp_withdrawal_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  ChimeCashappWithdrawalRequest.associate = function (models) {
    if (models.User) {
      ChimeCashappWithdrawalRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
      ChimeCashappWithdrawalRequest.belongsTo(models.User, { foreignKey: 'approvedByUserId', as: 'ApprovedByUser' });
    }
  };

  return ChimeCashappWithdrawalRequest;
};
