'use strict';

module.exports = function (sequelize, DataTypes) {
  const PushCampaign = sequelize.define(
    'PushCampaign',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'store_code'
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(128),
        allowNull: false,
        defaultValue: ''
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
      },
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'image_url'
      },
      iconUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'icon_url'
      },
      actionUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'action_url'
      },
      testMode: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'test_mode'
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'draft'
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'created_by_user_id'
      },
      lastSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_sent_at'
      }
    },
    {
      sequelize,
      tableName: 'push_campaigns',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  PushCampaign.associate = function (models) {
    if (models.PushCampaignTestUser) {
      PushCampaign.hasMany(models.PushCampaignTestUser, { foreignKey: 'campaignId', as: 'TestUsers' });
    }
    if (models.PushCampaignSend) {
      PushCampaign.hasMany(models.PushCampaignSend, { foreignKey: 'campaignId', as: 'Sends' });
    }
  };

  return PushCampaign;
};
