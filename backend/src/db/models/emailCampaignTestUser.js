'use strict';

module.exports = function (sequelize, DataTypes) {
  const EmailCampaignTestUser = sequelize.define(
    'EmailCampaignTestUser',
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
      tableName: 'email_campaign_test_users',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true
    }
  );

  EmailCampaignTestUser.associate = function (models) {
    if (models.EmailCampaign) {
      EmailCampaignTestUser.belongsTo(models.EmailCampaign, { foreignKey: 'campaignId', as: 'Campaign' });
    }
    if (models.User) {
      EmailCampaignTestUser.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
  };

  return EmailCampaignTestUser;
};
