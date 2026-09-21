'use strict';

const ACTIVITY_TYPES = ['register', 'login', 'topup', 'withdraw'];

module.exports = function (sequelize, DataTypes) {
  const GameActivity = sequelize.define(
    'GameActivity',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
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
      activityType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'activity_type'
      },
      amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      operationDoneBy: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'operation_done_by'
      },
      operationDoneByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'operation_done_by_user_id',
        references: { model: 'users', key: 'user_id' }
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
      tableName: 'game_activities',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['user_id', 'created_at'] },
        { fields: ['game_id'] }
      ]
    }
  );

  GameActivity.associate = function (models) {
    if (models.User) {
      GameActivity.belongsTo(models.User, { foreignKey: 'userId' });
      GameActivity.belongsTo(models.User, { foreignKey: 'operationDoneByUserId', as: 'OperationDoneByUser' });
    }
    if (models.Game) {
      GameActivity.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  GameActivity.ACTIVITY_TYPES = ACTIVITY_TYPES;
  return GameActivity;
};
