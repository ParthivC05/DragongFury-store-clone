'use strict';

module.exports = function (sequelize, DataTypes) {
  const WalletLedger = sequelize.define('WalletLedger', {
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
    entryType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'entry_type'
    },
    assetType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'SC',
      field: 'asset_type'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'amount'
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
    reason: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'reason'
    },
    referenceType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'reference_type'
    },
    referenceId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'reference_id'
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'idempotency_key'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'metadata'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    sequelize,
    tableName: 'wallet_ledger',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  WalletLedger.associate = function (models) {
    if (models.User) {
      WalletLedger.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return WalletLedger;
};
