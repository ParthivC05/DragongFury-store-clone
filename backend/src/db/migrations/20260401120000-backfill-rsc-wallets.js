'use strict';

/**
 * Ensure every user has an RSC (redeemable SC) wallet row alongside primary SC.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO wallets (user_id, currency_code, balance, play_balance, frozen_balance, created_at, updated_at)
      SELECT u.user_id, 'RSC', 0, 0, 0, NOW(), NOW()
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM wallets w WHERE w.user_id = u.user_id AND w.currency_code = 'RSC'
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM wallets WHERE currency_code = 'RSC';
    `);
  }
};
