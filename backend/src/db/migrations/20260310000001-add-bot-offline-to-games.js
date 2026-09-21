'use strict';

/**
 * Add bot_offline flag to games table.
 * When true, all bot operations for that game (register, deposit, redeem)
 * are routed to manual approval instead of calling the bot API.
 * Idempotent: safe to run if the column already exists.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'bot_offline'`
    );
    if (rows.length === 0) {
      await queryInterface.addColumn('games', 'bot_offline', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('games', 'bot_offline');
  }
};
