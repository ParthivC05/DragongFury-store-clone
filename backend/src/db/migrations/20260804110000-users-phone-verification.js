'use strict';

/**
 * Phone OTP verification (Didit standalone) — one-time verify for signup / existing users.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL
    `);

    await q(`CREATE INDEX IF NOT EXISTS users_is_phone_verified_idx ON users (is_phone_verified)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP INDEX IF EXISTS users_is_phone_verified_idx`);
    await q(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS is_phone_verified,
      DROP COLUMN IF EXISTS phone_verified_at
    `);
  }
};
