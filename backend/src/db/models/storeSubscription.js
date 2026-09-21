'use strict';

module.exports = function (sequelize, DataTypes) {
  const StoreSubscription = sequelize.define(
    'StoreSubscription',
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
      subscriptionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'subscription_id'
      },
      startsAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'starts_at'
      },
      endsAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'ends_at'
      },
      extendedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'extended_at'
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'active'
      }
    },
    {
      sequelize,
      tableName: 'store_subscriptions',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  StoreSubscription.associate = function (models) {
    if (models.Subscription) {
      StoreSubscription.belongsTo(models.Subscription, { foreignKey: 'subscriptionId' });
    }
  };

  return StoreSubscription;
};
