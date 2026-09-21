'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserGameAccount = sequelize.define(
    'UserGameAccount',
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
      botUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'bot_username'
      },
      botPassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'bot_password'
      },
      status: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'pending'
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      operationDoneBy: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'operation_done_by'
        // values: 'bot' | 'store_admin' | 'distributor_admin' | 'master_admin'
      },
      providerUserId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'provider_user_id',
        comment: 'Game provider account id (e.g. GameVault addUser user_id)'
      }
    },
    {
      sequelize,
      tableName: 'user_game_accounts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { unique: true, fields: ['user_id', 'game_id'] },
        { fields: ['user_id'] },
        { fields: ['game_id'] }
      ]
    }
  );

  UserGameAccount.associate = function (models) {
    if (models.User) {
      UserGameAccount.belongsTo(models.User, { foreignKey: 'userId' });
    }
    if (models.Game) {
      UserGameAccount.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  return UserGameAccount;
};
