'use strict';

/**
 * Tracks last sent date for Golden Dragon drawer alerts (one email per game per day).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'game_golden_dragon_drawer_alert_sent',
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
    await queryInterface.dropTable('game_golden_dragon_drawer_alert_sent', { transaction });
  }
};
