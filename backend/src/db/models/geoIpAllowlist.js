'use strict';

module.exports = function (sequelize, DataTypes) {
  const GeoIpAllowlist = sequelize.define(
    'GeoIpAllowlist',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'store_code'
      },
      ipAddress: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'ip_address'
      },
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'note'
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'created_by_user_id'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'updated_at'
      }
    },
    {
      sequelize,
      tableName: 'geo_ip_allowlist',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  GeoIpAllowlist.associate = function (models) {
    if (models.User) {
      GeoIpAllowlist.belongsTo(models.User, {
        foreignKey: 'createdByUserId',
        as: 'CreatedBy'
      });
    }
  };

  return GeoIpAllowlist;
};
