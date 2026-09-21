'use strict';

module.exports = function (sequelize, DataTypes) {
  const OneGameHubSession = sequelize.define('OneGameHubSession', {
    playerId: {
      type: DataTypes.STRING(32),
      primaryKey: true,
      allowNull: false,
      field: 'player_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '',
      field: 'store_code'
    },
    gameId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'game_id'
    },
    currency: {
      type: DataTypes.STRING(4),
      allowNull: false,
      defaultValue: 'SSC'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    }
  }, {
    sequelize,
    tableName: 'one_game_hub_sessions',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['expires_at'] }
    ]
  });

  OneGameHubSession.associate = function (models) {
    if (models.User) {
      OneGameHubSession.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return OneGameHubSession;
};
