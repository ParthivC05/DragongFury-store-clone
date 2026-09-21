'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameTemplate = sequelize.define(
    'GameTemplate',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: 'Display name for dropdown (e.g. VegasX, Juwa)'
      },
      gameKey: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'game_key',
        comment: 'Key used for provider API (e.g. VegasX, Juwa). Null for Vblink/UltraPanda.'
      },
      streamlitToken: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'streamlit_token',
        comment: 'Null for Vblink/UltraPanda (no third-party token).'
      },
      botBaseUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'bot_base_url'
      },
      gameLink: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'game_link',
        comment: 'Platform game URL shown when adding a game'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      }
    },
    {
      sequelize,
      tableName: 'game_templates',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  return GameTemplate;
};
