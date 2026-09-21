'use strict';

module.exports = function (sequelize, DataTypes) {
  const WalletScLedger = sequelize.define('WalletScLedger', {
    id: {
      type: DataTypes.BIGINT,
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
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    walletType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'wallet_type'
    },
    direction: {
      type: DataTypes.STRING(8),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    eventType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'event_type'
    },
    sourceType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'source_type'
    },
    sourceId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'source_id'
    },
    productId: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'product_id'
    },
    productType: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: 'product_type'
    },
    providerId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'provider_id'
    },
    gameId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'game_id'
    },
    roundId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'round_id'
    },
    bonusType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'bonus_type'
    },
    bonusLotId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'bonus_lot_id'
    },
    paymentId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'payment_id'
    },
    processorId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'processor_id'
    },
    packageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_id'
    },
    parentTransactionId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'parent_transaction_id'
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'idempotency_key'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by'
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    balanceBefore: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'balance_before'
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'balance_after'
    },
    isBonusOrigin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_bonus_origin'
    },
    grossAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'gross_amount'
    },
    eligibleAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'eligible_amount'
    },
    voidedAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'voided_amount'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    sequelize,
    tableName: 'wallet_sc_ledger',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  WalletScLedger.associate = function (models) {
    if (models.User) {
      WalletScLedger.belongsTo(models.User, { foreignKey: 'userId' });
    }
    if (models.BonusScLot) {
      WalletScLedger.belongsTo(models.BonusScLot, { foreignKey: 'bonusLotId' });
    }
  };

  return WalletScLedger;
};
