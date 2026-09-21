'use strict';

/** Rename play_to_withdraw_balance to play_balance (shorter name; deposit_balance no longer exists). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name IN ('play_to_withdraw_balance', 'play_balance')`,
      { transaction }
    );
    const hasOld = cols && cols.some((r) => r.column_name === 'play_to_withdraw_balance');
    const hasPlayBalance = cols && cols.some((r) => r.column_name === 'play_balance');
    if (hasOld && !hasPlayBalance) {
      await queryInterface.renameColumn(
        'wallets',
        'play_to_withdraw_balance',
        'play_balance',
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'play_balance'`,
      { transaction }
    );
    if (cols && cols.length > 0) {
      await queryInterface.renameColumn(
        'wallets',
        'play_balance',
        'play_to_withdraw_balance',
        { transaction }
      );
    }
  }
};
