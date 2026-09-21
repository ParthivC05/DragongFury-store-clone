'use strict';

const ACTION_TYPES = ['register_approved', 'credentials_updated'];

module.exports = function (sequelize, DataTypes) {
  const GameManualRequestLog = sequelize.define(
    'GameManualRequestLog',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      manualRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'manual_request_id',
        references: { model: 'game_manual_requests', key: 'id' }
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id',
        references: { model: 'users', key: 'user_id' }
      },
      gameId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'game_id',
        references: { model: 'games', key: 'id' }
      },
      actionType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'action_type'
      },
      gameUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'game_username'
      },
      gamePassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'game_password'
      },
      previousGameUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'previous_game_username'
      },
      previousGamePassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'previous_game_password'
      },
      performedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'performed_by_user_id',
        references: { model: 'users', key: 'user_id' }
      },
      operationDoneBy: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'operation_done_by'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      tableName: 'game_manual_request_logs',
      timestamps: false,
      updatedAt: false,
      createdAt: 'created_at',
      indexes: [
        { fields: ['manual_request_id'] },
        { fields: ['created_at'] }
      ]
    }
  );

  GameManualRequestLog.associate = function (models) {
    if (models.GameManualRequest) {
      GameManualRequestLog.belongsTo(models.GameManualRequest, { foreignKey: 'manualRequestId' });
    }
    if (models.User) {
      GameManualRequestLog.belongsTo(models.User, { foreignKey: 'userId' });
      GameManualRequestLog.belongsTo(models.User, { foreignKey: 'performedByUserId', as: 'PerformedByUser' });
    }
    if (models.Game) {
      GameManualRequestLog.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  GameManualRequestLog.ACTION_TYPES = ACTION_TYPES;
  return GameManualRequestLog;
};
