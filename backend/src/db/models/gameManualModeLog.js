'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameManualModeLog = sequelize.define(
    'GameManualModeLog',
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
      gameStoreUsername: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'game_store_username'
      },
      gameStorePassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'game_store_password'
      },
      automationApiError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'automation_api_error'
      },
      switchedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'switched_by_user_id',
        references: { model: 'users', key: 'user_id' }
      },
      switchedByName: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'switched_by_name'
      },
      triggerSource: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'automation_failure',
        field: 'trigger_source'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at'
      }
    },
    {
      sequelize,
      tableName: 'game_manual_mode_logs',
      timestamps: false
    }
  );

  GameManualModeLog.associate = function (models) {
    if (models.Game) {
      GameManualModeLog.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
    if (models.User) {
      GameManualModeLog.belongsTo(models.User, { foreignKey: 'switchedByUserId', as: 'SwitchedByUser' });
    }
  };

  return GameManualModeLog;
};
