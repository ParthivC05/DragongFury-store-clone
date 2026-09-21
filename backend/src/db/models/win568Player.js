'use strict';

module.exports = function (sequelize, DataTypes) {
  const Win568Player = sequelize.define('Win568Player', {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    balance: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'win568_players',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  Win568Player.associate = function (models) {
    if (models.User) {
      Win568Player.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return Win568Player;
};
