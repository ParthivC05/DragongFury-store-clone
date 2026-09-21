'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameBotAutomationFailure = sequelize.define(
    'GameBotAutomationFailure',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      gameId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'game_id',
        references: { model: 'games', key: 'id' }
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: '',
        field: 'store_code'
      },
      platformUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'platform_user_id',
        references: { model: 'users', key: 'user_id' }
      },
      operationType: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'operation_type'
      },
      errorSummary: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'error_summary'
      },
      gameUsername: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'game_username'
      },
      externalResponse: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'external_response'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at'
      }
    },
    {
      sequelize,
      tableName: 'game_bot_automation_failures',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt'
    }
  );

  GameBotAutomationFailure.associate = function (models) {
    if (models.Game) {
      GameBotAutomationFailure.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
    if (models.User) {
      GameBotAutomationFailure.belongsTo(models.User, { foreignKey: 'platformUserId' });
    }
  };

  return GameBotAutomationFailure;
};
