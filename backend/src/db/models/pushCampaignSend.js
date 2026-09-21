'use strict';

module.exports = function (sequelize, DataTypes) {
  const PushCampaignSend = sequelize.define(
    'PushCampaignSend',
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
      deviceTokenId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'device_token_id'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'user_id'
      },
      clickToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'click_token'
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'queued'
      },
      successTokenCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'success_token_count'
      },
      failureTokenCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'failure_token_count'
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sent_at'
      },
      clickedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'clicked_at'
      }
    },
    {
      sequelize,
      tableName: 'push_campaign_sends',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  PushCampaignSend.associate = function (models) {
    if (models.PushCampaign) {
      PushCampaignSend.belongsTo(models.PushCampaign, { foreignKey: 'campaignId', as: 'Campaign' });
    }
    if (models.User) {
      PushCampaignSend.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
    if (models.UserDeviceToken) {
      PushCampaignSend.belongsTo(models.UserDeviceToken, { foreignKey: 'deviceTokenId', as: 'Device' });
    }
  };

  return PushCampaignSend;
};
