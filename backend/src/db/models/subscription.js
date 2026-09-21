'use strict';

module.exports = function (sequelize, DataTypes) {
  const Subscription = sequelize.define(
    'Subscription',
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      priceDisplay: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'price_display'
      },
      durationMonths: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        field: 'duration_months'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      billingType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'flat',
        field: 'billing_type'
      },
      flatAmountCents: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'flat_amount_cents'
      },
      percentageValue: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'percentage_value'
      },
      percentageBase: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'percentage_base'
      }
    },
    {
      sequelize,
      tableName: 'subscriptions',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  Subscription.associate = function (models) {
    if (models.StoreSubscriptionRequest) {
      Subscription.hasMany(models.StoreSubscriptionRequest, { foreignKey: 'subscriptionId' });
    }
    if (models.StoreSubscription) {
      Subscription.hasMany(models.StoreSubscription, { foreignKey: 'subscriptionId' });
    }
  };

  return Subscription;
};
