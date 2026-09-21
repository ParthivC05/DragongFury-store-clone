'use strict';

module.exports = function (sequelize, DataTypes) {
  const Setting = sequelize.define('Setting', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    key: {
      type: DataTypes.STRING(128),
      allowNull: false
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
    value: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'settings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  return Setting;
};
