'use strict';

/**
 * Add columns to payment_pending_deposits for secure payment modal payload:
 * asset_code, network, qr_code_url, wallet_address, payment_uri, expires_at.
 */
const TABLE = 'payment_pending_deposits';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${TABLE}
      ADD COLUMN IF NOT EXISTS asset_code VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS network VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS qr_code_url TEXT NULL,
      ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS payment_uri TEXT NULL,
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const cols = ['asset_code', 'network', 'qr_code_url', 'wallet_address', 'payment_uri', 'expires_at'];
    for (const col of cols) {
      await queryInterface.removeColumn(TABLE, col, { transaction }).catch(() => {});
    }
  }
};
