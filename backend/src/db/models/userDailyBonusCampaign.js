'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserDailyBonusCampaign = sequelize.define(
    'UserDailyBonusCampaign',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id'
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'store_code'
      },
      distributorCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'distributor_code'
      },
      startedOn: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'started_on'
      },
      endsOn: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'ends_on'
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'active'
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'completed_at'
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
      tableName: 'user_daily_bonus_campaigns',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  UserDailyBonusCampaign.associate = function (models) {
    UserDailyBonusCampaign.belongsTo(models.User, { foreignKey: 'userId' });
    UserDailyBonusCampaign.hasMany(models.UserDailyBonusClaim, {
      foreignKey: 'campaignId',
      as: 'Claims'
    });
    UserDailyBonusCampaign.hasMany(models.UserDailyBonusVoucher, {
      foreignKey: 'campaignId',
      as: 'Vouchers'
    });
  };

  return UserDailyBonusCampaign;
};
