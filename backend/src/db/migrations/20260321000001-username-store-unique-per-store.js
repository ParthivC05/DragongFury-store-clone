'use strict';

/**
 * Change username uniqueness from global to per-store:
 * - (username, store_code) unique when store_code IS NOT NULL (case-insensitive via LOWER)
 * - (username) unique when store_code IS NULL (legacy)
 *
 * Allows same username in different stores (e.g. thor-01 in Ironman and thor-01 in Thor).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    // 1. Drop ALL existing unique constraints on username (names vary: users_username_key, users_username_key12, etc.)
    const dropConstraint = async (name) => {
      try {
        await sequelize.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${name}"`, { transaction });
      } catch (e) {
        // Ignore
      }
    };
    await dropConstraint('users_username_key');
    await dropConstraint('users_username_key12');
    // Also drop any other username unique constraints (query pg_constraint for users table)
    const [rows] = await sequelize.query(
      `SELECT c.conname FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
       WHERE c.conrelid = 'public.users'::regclass AND c.contype = 'u' AND a.attname = 'username'`,
      { transaction }
    );
    for (const row of rows || []) {
      if (row && row.conname) await dropConstraint(row.conname);
    }

    // 2. Create partial unique indexes (case-insensitive via LOWER for consistency)
    // Username: (LOWER(username), store_code) unique when store has a value
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_store_code_key
       ON users (LOWER(username), store_code) WHERE store_code IS NOT NULL AND username IS NOT NULL`,
      { transaction }
    );

    // Username: (LOWER(username)) unique when store_code is NULL (legacy)
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_null_store_key
       ON users (LOWER(username)) WHERE store_code IS NULL AND username IS NOT NULL`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const dropIndex = async (name) => {
      try {
        await sequelize.query(`DROP INDEX IF EXISTS "${name}"`, { transaction });
      } catch (e) {
        // Ignore
      }
    };

    await dropIndex('users_username_store_code_key');
    await dropIndex('users_username_null_store_key');

    // Restore original unique constraint
    await sequelize.query(
      `ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username)`,
      { transaction }
    ).catch(() => {});
  }
};
