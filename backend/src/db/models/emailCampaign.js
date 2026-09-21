'use strict';

module.exports = function (sequelize, DataTypes) {
  const EmailCampaign = sequelize.define(
    'EmailCampaign',
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
      triggerType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'no_deposit',
        field: 'trigger_type'
      },
      triggerDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        field: 'trigger_days'
      },
      isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_enabled'
      },
      testMode: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'test_mode'
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: ''
      },
      preheader: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      blocks: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      contentMode: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'blocks',
        field: 'content_mode'
      },
      bodyHtml: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'body_html'
      },
      logoUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'logo_url'
      },
      bannerUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'banner_url'
      },
      discountCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'discount_code'
      },
      discountValueType: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: 'discount_value_type'
      },
      discountValue: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: true,
        field: 'discount_value'
      },
      discountMinDeposit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'discount_min_deposit'
      },
      discountMaxBonusCap: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'discount_max_bonus_cap'
      },
      bonusCodeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'bonus_code_id'
      },
      batchSize: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'batch_size'
      },
      maxPerHour: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'max_per_hour'
      },
      claimTokenTtlDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 7,
        field: 'claim_token_ttl_days'
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'created_by_user_id'
      }
    },
    {
      sequelize,
      tableName: 'email_campaigns',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  EmailCampaign.associate = function (models) {
    if (models.BonusCode) {
      EmailCampaign.belongsTo(models.BonusCode, { foreignKey: 'bonusCodeId', as: 'BonusCode' });
    }
    if (models.EmailCampaignTestUser) {
      EmailCampaign.hasMany(models.EmailCampaignTestUser, { foreignKey: 'campaignId', as: 'TestUsers' });
    }
    if (models.EmailCampaignSend) {
      EmailCampaign.hasMany(models.EmailCampaignSend, { foreignKey: 'campaignId', as: 'Sends' });
    }
  };

  return EmailCampaign;
};
