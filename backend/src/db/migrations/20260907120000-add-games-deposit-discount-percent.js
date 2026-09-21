'use strict';

/**
 * Per-game deposit discount: wallet still pays the entered SC, the game
 * is credited extra. Example: 10% on a 10 SC top-up credits 11 SC in-game.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games'
       AND column_name = 'deposit_discount_percent'`,
      { transaction }
    );
    if (!(cols || []).length) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN deposit_discount_percent DECIMAL(6,2) NOT NULL DEFAULT 0`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`ALTER TABLE games DROP COLUMN IF EXISTS deposit_discount_percent`, { transaction });
  }
};
