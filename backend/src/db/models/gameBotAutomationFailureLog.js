'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameBotAutomationFailureLog = sequelize.define(
    'GameBotAutomationFailureLog',
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
      gameName: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'game_name'
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
      }
    },
    {
      sequelize,
      tableName: 'game_bot_automation_failure_logs',
      timestamps: false,
      updatedAt: false,
      createdAt: 'createdAt'
    }
  );

  GameBotAutomationFailureLog.associate = function (models) {
    if (models.Game) {
      GameBotAutomationFailureLog.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
    if (models.User) {
      GameBotAutomationFailureLog.belongsTo(models.User, { foreignKey: 'platformUserId' });
    }
  };

  return GameBotAutomationFailureLog;
};
