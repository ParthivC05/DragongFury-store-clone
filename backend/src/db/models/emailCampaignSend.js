'use strict';

module.exports = function (sequelize, DataTypes) {
  const EmailCampaignSend = sequelize.define(
    'EmailCampaignSend',
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
      email: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending'
      },
      mailgunId: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'mailgun_id'
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'attempt_count'
      },
      maxAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
        field: 'max_attempts'
      },
      errorClass: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: 'error_class'
      },
      errorCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'error_code'
      },
      lastAttemptAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_attempt_at'
      },
      deliveryStatus: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'delivery_status'
      },
      attemptsLog: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: 'attempts_log'
      },
      discountCodeSnapshot: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'discount_code_snapshot'
      },
      claimToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'claim_token'
      },
      claimStatus: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'unclaimed',
        field: 'claim_status'
      },
      claimedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'claimed_at'
      },
      codeAppliedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'code_applied_at'
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sent_at'
      }
    },
    {
      sequelize,
      tableName: 'email_campaign_sends',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  EmailCampaignSend.associate = function (models) {
    if (models.EmailCampaign) {
      EmailCampaignSend.belongsTo(models.EmailCampaign, { foreignKey: 'campaignId', as: 'Campaign' });
    }
    if (models.User) {
      EmailCampaignSend.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
    if (models.EmailCampaignSendAttempt) {
      EmailCampaignSend.hasMany(models.EmailCampaignSendAttempt, {
        foreignKey: 'sendId',
        as: 'Attempts'
      });
    }
  };

  return EmailCampaignSend;
};
