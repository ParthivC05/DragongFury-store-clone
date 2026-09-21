'use strict';

/**
 * - withdrawal_requests: add crypto_address (for Speed/crypto payout address).
 * - deposit_requests: add crypto_currency, tx_hash (for Speed deposit display).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE withdrawal_requests
      ADD COLUMN IF NOT EXISTS crypto_address VARCHAR(255) NULL
    `);

    await q(`
      ALTER TABLE deposit_requests
      ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255) NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('withdrawal_requests', 'crypto_address', { transaction }).catch(() => {});
    await queryInterface.removeColumn('deposit_requests', 'crypto_currency', { transaction }).catch(() => {});
    await queryInterface.removeColumn('deposit_requests', 'tx_hash', { transaction }).catch(() => {});
  }
};
