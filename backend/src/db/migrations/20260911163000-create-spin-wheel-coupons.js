'use strict';

/**
 * One-time deposit coupons issued when a user wins a coupon slice on the spin wheel.
 * Bound to the winning user; redeemed on a completed deposit.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS spin_wheel_coupons (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        code VARCHAR(32) NOT NULL,
        discount_percent DECIMAL(5,2) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'issued',
        spin_transaction_id INTEGER NULL REFERENCES user_transactions(id) ON DELETE SET NULL,
        deposit_request_id INTEGER NULL,
        applied_at TIMESTAMPTZ NULL,
        redeemed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT spin_wheel_coupons_percent_chk CHECK (discount_percent > 0 AND discount_percent < 100),
        CONSTRAINT spin_wheel_coupons_status_chk CHECK (status IN ('issued', 'applied', 'redeemed'))
      );
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS spin_wheel_coupons_code_uidx
      ON spin_wheel_coupons (upper(code));
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS spin_wheel_coupons_user_status_idx
      ON spin_wheel_coupons (user_id, status);
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS spin_wheel_coupons`, { transaction });
  }
};
