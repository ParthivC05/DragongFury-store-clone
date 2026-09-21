'use strict';

module.exports = function (sequelize, DataTypes) {
  const EmailCampaignSendAttempt = sequelize.define(
    'EmailCampaignSendAttempt',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      sendId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'send_id'
      },
      attemptNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'attempt_no'
      },
      source: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'api'
      },
      result: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      errorCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'error_code'
      },
      errorClass: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: 'error_class'
      },
      mailgunId: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'mailgun_id'
      },
      raw: {
        type: DataTypes.JSONB,
        allowNull: true
      }
    },
    {
      sequelize,
      tableName: 'email_campaign_send_attempts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true
    }
  );

  EmailCampaignSendAttempt.associate = function (models) {
    if (models.EmailCampaignSend) {
      EmailCampaignSendAttempt.belongsTo(models.EmailCampaignSend, {
        foreignKey: 'sendId',
        as: 'Send'
      });
    }
  };

  return EmailCampaignSendAttempt;
};
