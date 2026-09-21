'use strict';

/**
 * Store CentryOS withdrawal request id so we can call CentryOS approve when admin approves on Partner Platform.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE withdrawal_requests
      ADD COLUMN IF NOT EXISTS payment_api_request_id INTEGER NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('withdrawal_requests', 'payment_api_request_id', { transaction }).catch(() => {});
  }
};
