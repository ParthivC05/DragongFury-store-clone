'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameGoldenDragonDrawerAlertSent = sequelize.define(
    'GameGoldenDragonDrawerAlertSent',
    {
      gameId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        field: 'game_id',
        references: { model: 'games', key: 'id' }
      },
      lastSentDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'last_sent_date'
      }
    },
    {
      sequelize,
      tableName: 'game_golden_dragon_drawer_alert_sent',
      timestamps: false
    }
  );

  GameGoldenDragonDrawerAlertSent.associate = function (models) {
    if (models.Game) {
      GameGoldenDragonDrawerAlertSent.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  return GameGoldenDragonDrawerAlertSent;
};
