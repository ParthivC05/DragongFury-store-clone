'use strict';

module.exports = function (sequelize, DataTypes) {
  const PushCampaignTestUser = sequelize.define(
    'PushCampaignTestUser',
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
      }
    },
    {
      sequelize,
      tableName: 'push_campaign_test_users',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true
    }
  );

  PushCampaignTestUser.associate = function (models) {
    if (models.PushCampaign) {
      PushCampaignTestUser.belongsTo(models.PushCampaign, { foreignKey: 'campaignId', as: 'Campaign' });
    }
    if (models.User) {
      PushCampaignTestUser.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
  };

  return PushCampaignTestUser;
};
