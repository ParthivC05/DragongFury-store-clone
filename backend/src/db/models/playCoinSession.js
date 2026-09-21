'use strict';

module.exports = function (sequelize, DataTypes) {
  const PlayCoinSession = sequelize.define(
    'PlayCoinSession',
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
      provider: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      gameId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: '',
        field: 'game_id'
      },
      coinType: {
        type: DataTypes.STRING(2),
        allowNull: false,
        defaultValue: 'SC',
        field: 'coin_type'
      }
    },
    {
      sequelize,
      tableName: 'play_coin_sessions',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  PlayCoinSession.associate = function (models) {
    if (models.User) {
      PlayCoinSession.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return PlayCoinSession;
};
