'use strict';

module.exports = function (sequelize, DataTypes) {
  const DepositPackageGroup = sequelize.define(
    'DepositPackageGroup',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      distributorCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'distributor_code'
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'store_code'
      },
      groupKey: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'group_key'
      },
      title: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order'
      },
      startsAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'starts_at'
      },
      endsAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'ends_at'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      maxPurchasesPerUser: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'max_purchases_per_user'
      }
    },
    {
      sequelize,
      tableName: 'deposit_package_groups',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  DepositPackageGroup.associate = function (models) {
    if (models.DepositPackage) {
      DepositPackageGroup.hasMany(models.DepositPackage, {
        foreignKey: 'groupId',
        as: 'Packages'
      });
    }
  };

  return DepositPackageGroup;
};
