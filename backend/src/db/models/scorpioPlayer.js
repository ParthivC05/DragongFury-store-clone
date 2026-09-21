'use strict';

module.exports = function (sequelize, DataTypes) {
  const ScorpioPlayer = sequelize.define('ScorpioPlayer', {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    playerExternalId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'player_external_id'
    },
    playerCode: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'player_code'
    }
  }, {
    sequelize,
    tableName: 'scorpio_players',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['player_external_id'] }
    ]
  });

  ScorpioPlayer.associate = function (models) {
    if (models.User) {
      ScorpioPlayer.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return ScorpioPlayer;
};
