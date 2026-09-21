'use strict';

module.exports = function (sequelize, DataTypes) {
  const SelfcryptoHdCounter = sequelize.define('SelfcryptoHdCounter', {
    chain: {
      type: DataTypes.STRING(16),
      primaryKey: true,
      allowNull: false,
      field: 'chain'
    },
    nextIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'next_index'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'selfcrypto_hd_counters',
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at',
    underscored: true
  });

  return SelfcryptoHdCounter;
};
