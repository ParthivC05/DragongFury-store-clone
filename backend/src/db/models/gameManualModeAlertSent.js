'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameManualModeAlertSent = sequelize.define(
    'GameManualModeAlertSent',
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
      tableName: 'game_manual_mode_alert_sent',
      timestamps: false
    }
  );

  GameManualModeAlertSent.associate = function (models) {
    if (models.Game) {
      GameManualModeAlertSent.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
  };

  return GameManualModeAlertSent;
};
