'use strict';

/**
 * Add frozen_balance to wallets. Amount locked by pending withdrawal requests;
 * user cannot use it in games or request more until the withdrawal is approved or rejected.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE wallets
      ADD COLUMN IF NOT EXISTS frozen_balance DECIMAL(18,2) NOT NULL DEFAULT 0
    `);
    await q(`UPDATE wallets SET frozen_balance = 0 WHERE frozen_balance IS NULL`).catch(() => {});
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('wallets', 'frozen_balance', { transaction }).catch(() => {});
  }
};
