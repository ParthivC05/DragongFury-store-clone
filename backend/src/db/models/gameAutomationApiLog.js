'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameAutomationApiLog = sequelize.define(
    'GameAutomationApiLog',
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
        allowNull: true,
        field: 'store_code'
      },
      gameUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'game_username'
      },
      operation: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      apiEndpoint: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'api_endpoint'
      },
      httpStatus: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'http_status'
      },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'error_message'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at'
      }
    },
    {
      sequelize,
      tableName: 'game_automation_api_logs',
      timestamps: false
    }
  );

  GameAutomationApiLog.associate = function (models) {
    if (models.Game) {
      GameAutomationApiLog.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  return GameAutomationApiLog;
};
