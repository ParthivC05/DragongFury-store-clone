'use strict';

module.exports = function (sequelize, DataTypes) {
  const Game = sequelize.define(
    'Game',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      imageUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'image_url'
      },
      botType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'bot_type'
      },
      botApiUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'bot_api_url'
      },
      botUsername: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'bot_username'
      },
      botPassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'bot_password'
      },
      botApiKey: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'bot_api_key'
      },
      streamlitToken: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'streamlit_token'
      },
      minWithdrawalLimit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'min_withdrawal_limit'
      },
      maxWithdrawalLimit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 500,
        field: 'max_withdrawal_limit'
      },
      minDepositLimit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'min_deposit_limit'
      },
      maxDepositLimit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'max_deposit_limit'
      },
      depositDiscountPercent: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'deposit_discount_percent',
        comment: 'Extra % credited in-game on top-up. Wallet still pays the entered amount. 10 on a 10 SC top-up credits 11 SC.'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'display_order'
      },
      platformGameUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'platform_game_url'
      },
      addedByStoreCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'added_by_store_code'
      },
      addedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'added_by_user_id',
        comment: 'Store admin user who added the game; used to scope staff edits'
      },
      botOffline: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'bot_offline'
      },
      manualRedeemOnly: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'manual_redeem_only'
      },
      appId: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'app_id',
        comment: 'Store-level app ID for Vblink/UltraPanda games'
      },
      appSecret: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'app_secret',
        comment: 'Store-level app secret for Vblink/UltraPanda games'
      },
      kioskId: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: 'kiosk_id',
        comment: 'Golden Dragon: 7-digit POS kiosk id (kiosk_id on provider add-client)'
      },
      agentId: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'agent_id',
        comment: 'Store-level agent ID for GameVault external API'
      },
      apiSecretKey: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'api_secret_key',
        comment: 'Store-level API secret key for GameVault external API'
      },
      gameKey: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'game_key',
        comment: 'Integration key (e.g. juwa20 bot, juwa20_agent direct API, gamevault_agent)'
      },
      gameTemplateId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'game_template_id',
        comment: 'Source game template when the store added this game'
      }
    },
    {
      sequelize,
      tableName: 'games',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  Game.associate = function (models) {
    if (models.GameTemplate) {
      Game.belongsTo(models.GameTemplate, { foreignKey: 'gameTemplateId', as: 'gameTemplate' });
    }
    if (models.UserGameAccount) {
      Game.hasMany(models.UserGameAccount, { foreignKey: 'gameId' });
    }
    if (models.GameActivity) {
      Game.hasMany(models.GameActivity, { foreignKey: 'gameId' });
    }
    if (models.GameManualRequest) {
      Game.hasMany(models.GameManualRequest, { foreignKey: 'gameId' });
    }
    if (models.GameManualModeAlertSent) {
      Game.hasMany(models.GameManualModeAlertSent, { foreignKey: 'gameId' });
    }
  };

  return Game;
};
