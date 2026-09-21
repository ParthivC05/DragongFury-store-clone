'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameBalanceAlertSent = sequelize.define(
    'GameBalanceAlertSent',
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
      tableName: 'game_balance_alert_sent',
      timestamps: false
    }
  );

  GameBalanceAlertSent.associate = function (models) {
    if (models.Game) {
      GameBalanceAlertSent.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  return GameBalanceAlertSent;
};
