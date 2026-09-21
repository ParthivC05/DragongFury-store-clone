'use strict';

/**
 * RSC is cashable without play-through. Admin add-SC used to attach play_balance
 * on RSC, which blocked cashout. Clear leftover locks on existing wallets.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE wallets
      SET play_balance = 0,
          updated_at = NOW()
      WHERE currency_code = 'RSC'
        AND play_balance <> 0
    `);
  },

  async down() {}
};
