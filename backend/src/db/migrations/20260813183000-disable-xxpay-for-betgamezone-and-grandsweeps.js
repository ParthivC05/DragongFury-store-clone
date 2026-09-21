'use strict';

/**
 * Disable XXPay for betgamezone + grandsweeps (not allowlisted for admin/API).
 * Only flips XXPay flags OFF — does not touch method maps or other providers.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `
      UPDATE store_payment_providers
      SET
        enabled = false,
        deposit_enabled = false,
        withdraw_enabled = false,
        updated_at = NOW()
      WHERE provider_code = 'xxpay'
        AND LOWER(store_code) IN ('betgamezone', 'grandsweeps')
      `,
      { transaction }
    );
  },

  async down() {
    // No-op: re-enabling requires explicit allowlist + admin action.
  }
};
