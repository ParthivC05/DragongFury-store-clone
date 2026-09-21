'use strict';

module.exports = function (sequelize, DataTypes) {
  const BonusScLotConsumption = sequelize.define('BonusScLotConsumption', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    lotId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'lot_id',
      references: { model: 'bonus_sc_lots', key: 'id' }
    },
    ledgerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'ledger_id',
      references: { model: 'wallet_sc_ledger', key: 'id' }
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    sequelize,
    tableName: 'bonus_sc_lot_consumptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  BonusScLotConsumption.associate = function (models) {
    if (models.BonusScLot) {
      BonusScLotConsumption.belongsTo(models.BonusScLot, { foreignKey: 'lotId' });
    }
    if (models.WalletScLedger) {
      BonusScLotConsumption.belongsTo(models.WalletScLedger, { foreignKey: 'ledgerId' });
    }
  };

  return BonusScLotConsumption;
};
