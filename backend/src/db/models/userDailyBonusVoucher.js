'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserDailyBonusVoucher = sequelize.define(
    'UserDailyBonusVoucher',
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
      campaignId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'campaign_id'
      },
      claimId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'claim_id'
      },
      percentOff: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: 'percent_off'
      },
      packageScope: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'all',
        field: 'package_scope'
      },
      packageIds: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'package_ids'
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'available'
      },
      usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'used_at'
      },
      usedOnPackageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'used_on_package_id'
      },
      depositRequestId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'deposit_request_id'
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
      tableName: 'user_daily_bonus_vouchers',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  UserDailyBonusVoucher.associate = function (models) {
    UserDailyBonusVoucher.belongsTo(models.User, { foreignKey: 'userId' });
    UserDailyBonusVoucher.belongsTo(models.UserDailyBonusCampaign, {
      foreignKey: 'campaignId',
      as: 'Campaign'
    });
    UserDailyBonusVoucher.belongsTo(models.UserDailyBonusClaim, {
      foreignKey: 'claimId',
      as: 'Claim'
    });
  };

  return UserDailyBonusVoucher;
};
