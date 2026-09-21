'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [rows] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'deposit_balance'`,
      { transaction }
    );
    if (!rows || rows.length === 0) {
      await queryInterface.addColumn(
        'wallets',
        'deposit_balance',
        {
          type: Sequelize.DECIMAL(18, 2),
          allowNull: false,
          defaultValue: 0
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE wallets SET deposit_balance = 0 WHERE deposit_balance IS NULL`,
        { transaction }
      ).catch(() => {});
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('wallets', 'deposit_balance', { transaction }).catch(() => {});
  }
};
