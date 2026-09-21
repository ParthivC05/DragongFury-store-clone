'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserDailyBonusClaim = sequelize.define(
    'UserDailyBonusClaim',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      campaignId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'campaign_id'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id'
      },
      dayIndex: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        field: 'day_index'
      },
      rewardType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'reward_type'
      },
      rewardPayload: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'reward_payload'
      },
      claimedOn: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'claimed_on'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_at'
      }
    },
    {
      sequelize,
      tableName: 'user_daily_bonus_claims',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true
    }
  );

  UserDailyBonusClaim.associate = function (models) {
    UserDailyBonusClaim.belongsTo(models.User, { foreignKey: 'userId' });
    UserDailyBonusClaim.belongsTo(models.UserDailyBonusCampaign, {
      foreignKey: 'campaignId',
      as: 'Campaign'
    });
    UserDailyBonusClaim.hasOne(models.UserDailyBonusVoucher, {
      foreignKey: 'claimId',
      as: 'Voucher'
    });
  };

  return UserDailyBonusClaim;
};
