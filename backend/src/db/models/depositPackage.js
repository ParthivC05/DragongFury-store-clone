'use strict';

module.exports = function (sequelize, DataTypes) {
  const DepositPackage = sequelize.define(
    'DepositPackage',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      groupId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'group_id',
        references: { model: 'deposit_package_groups', key: 'id' }
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
      title: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      finalSc: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        field: 'final_sc'
      },
      gcCoin: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'gc_coin'
      },
      actualPrice: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        field: 'actual_price'
      },
      finalPrice: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        field: 'final_price'
      },
      discountLabel: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'discount_label'
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
      tableName: 'deposit_packages',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  DepositPackage.associate = function (models) {
    if (models.DepositPackageGroup) {
      DepositPackage.belongsTo(models.DepositPackageGroup, {
        foreignKey: 'groupId',
        as: 'Group'
      });
    }
  };

  return DepositPackage;
};
