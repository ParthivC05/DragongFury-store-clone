'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserGameCredentialHistory = sequelize.define(
    'UserGameCredentialHistory',
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
      action: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      oldUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'old_username'
      },
      oldPassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'old_password'
      },
      newUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'new_username'
      },
      newPassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'new_password'
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
      tableName: 'user_game_credential_histories',
      timestamps: false,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['game_id'] }
      ]
    }
  );

  UserGameCredentialHistory.associate = function (models) {
    if (models.User) {
      UserGameCredentialHistory.belongsTo(models.User, { foreignKey: 'userId' });
      UserGameCredentialHistory.belongsTo(models.User, { foreignKey: 'performedByUserId', as: 'PerformedByUser' });
    }
    if (models.Game) {
      UserGameCredentialHistory.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  return UserGameCredentialHistory;
};
