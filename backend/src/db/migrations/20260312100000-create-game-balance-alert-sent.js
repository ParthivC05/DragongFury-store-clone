'use strict';

/**
 * Tracks last sent date for game bot balance alerts (one email per game per day).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'game_balance_alert_sent',
      {
        game_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: 'games', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        last_sent_date: {
          type: Sequelize.DATEONLY,
          allowNull: false
        }
      },
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('game_balance_alert_sent', { transaction });
  }
};
