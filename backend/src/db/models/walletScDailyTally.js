'use strict';

module.exports = function (sequelize, DataTypes) {
  const WalletScDailyTally = sequelize.define('WalletScDailyTally', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    tallyDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'tally_date'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id'
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    differencePsc: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'difference_psc'
    },
    differenceBonus: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'difference_bonus'
    },
    differenceRsc: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'difference_rsc'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    sequelize,
    tableName: 'wallet_sc_daily_tallies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  return WalletScDailyTally;
};
