'use strict';

module.exports = function (sequelize, DataTypes) {
  const BonusScLot = sequelize.define('BonusScLot', {
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
    bonusType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'bonus_type'
    },
    originalAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'original_amount'
    },
    remainingAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'remaining_amount'
    },
    maxCashout: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'max_cashout'
    },
    requiresDeposit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'requires_deposit'
    },
    excessWinAction: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'void',
      field: 'excess_win_action'
    },
    rscGeneratedGross: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'rsc_generated_gross'
    },
    rscGeneratedEligible: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'rsc_generated_eligible'
    },
    rscVoidedCap: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'rsc_voided_cap'
    },
    outstandingPlay: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'outstanding_play'
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
    paymentId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'payment_id'
    },
    packageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_id'
    },
    ledgerId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'ledger_id'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    sequelize,
    tableName: 'bonus_sc_lots',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  BonusScLot.associate = function (models) {
    if (models.User) {
      BonusScLot.belongsTo(models.User, { foreignKey: 'userId' });
    }
    if (models.WalletScLedger) {
      BonusScLot.belongsTo(models.WalletScLedger, { foreignKey: 'ledgerId' });
    }
    if (models.BonusScLotConsumption) {
      BonusScLot.hasMany(models.BonusScLotConsumption, { foreignKey: 'lotId', as: 'Consumptions' });
    }
  };

  return BonusScLot;
};
