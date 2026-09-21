'use strict';

module.exports = function (sequelize, DataTypes) {
  const StoreSubscriptionRequest = sequelize.define(
    'StoreSubscriptionRequest',
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
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending'
      },
      requestedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'requested_at'
      },
      requestedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'requested_by_user_id'
      },
      approvedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'approved_by_user_id'
      },
      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'approved_at'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      approvedPeriodStartsAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'approved_period_starts_at'
      },
      approvedPeriodEndsAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'approved_period_ends_at'
      }
    },
    {
      sequelize,
      tableName: 'store_subscription_requests',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  StoreSubscriptionRequest.associate = function (models) {
    if (models.Subscription) {
      StoreSubscriptionRequest.belongsTo(models.Subscription, { foreignKey: 'subscriptionId' });
    }
    if (models.User) {
      StoreSubscriptionRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'RequestedByUser' });
      StoreSubscriptionRequest.belongsTo(models.User, { foreignKey: 'approvedByUserId', as: 'ApprovedByUser' });
    }
  };

  return StoreSubscriptionRequest;
};
