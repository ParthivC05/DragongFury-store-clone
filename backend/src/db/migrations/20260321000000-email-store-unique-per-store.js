'use strict';

/**
 * Change user uniqueness from global email to per-store:
 * - (email, store_code) unique when store_code IS NOT NULL
 * - (email) unique when store_code IS NULL (legacy single-account-per-email)
 * - (google_id, store_code) unique when both set; (google_id) unique when store_code IS NULL
 * - (facebook_id, store_code) unique when both set; (facebook_id) unique when store_code IS NULL
 *
 * Flow: One email per store, one account. Same email can have multiple accounts in different stores.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const sequelize = queryInterface.sequelize;

    // 1. Drop ALL existing unique constraints on email, google_id, facebook_id (names vary: users_email_key, users_email_key12, etc.)
    const dropConstraint = async (name) => {
      try {
        await sequelize.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${name}"`, { transaction });
      } catch (e) {
        // Ignore
      }
    };
    const dropConstraintsForColumn = async (columnName) => {
      const [rows] = await sequelize.query(
        `SELECT c.conname FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
         WHERE c.conrelid = 'public.users'::regclass AND c.contype = 'u' AND a.attname = $1`,
        { bind: [columnName], transaction }
      );
      for (const row of rows || []) {
        if (row && row.conname) await dropConstraint(row.conname);
      }
      // Fallback: drop known base names (users_email_key, users_email_key12, etc.)
      const baseName = `users_${columnName}_key`;
      await dropConstraint(baseName);
      for (let i = 1; i <= 20; i++) await dropConstraint(`${baseName}${i}`);
    };
    await dropConstraintsForColumn('email');
    await dropConstraintsForColumn('google_id');
    await dropConstraintsForColumn('facebook_id');

    // 2. Create partial unique indexes

    // Email: (email, store_code) unique when store has a value
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_store_code_key
       ON users (email, store_code) WHERE store_code IS NOT NULL`,
      { transaction }
    );

    // Email: (email) unique when store_code is NULL (legacy)
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_null_store_key
       ON users (email) WHERE store_code IS NULL`,
      { transaction }
    );

    // Google: (google_id, store_code) unique when both set
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_store_code_key
       ON users (google_id, store_code) WHERE google_id IS NOT NULL AND store_code IS NOT NULL`,
      { transaction }
    );

    // Google: (google_id) unique when store_code is NULL
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_null_store_key
       ON users (google_id) WHERE google_id IS NOT NULL AND store_code IS NULL`,
      { transaction }
    );

    // Facebook: (facebook_id, store_code) unique when both set
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_store_code_key
       ON users (facebook_id, store_code) WHERE facebook_id IS NOT NULL AND store_code IS NOT NULL`,
      { transaction }
    );

    // Facebook: (facebook_id) unique when store_code is NULL
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_null_store_key
       ON users (facebook_id) WHERE facebook_id IS NOT NULL AND store_code IS NULL`,
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

    await dropIndex('users_email_store_code_key');
    await dropIndex('users_email_null_store_key');
    await dropIndex('users_google_id_store_code_key');
    await dropIndex('users_google_id_null_store_key');
    await dropIndex('users_facebook_id_store_code_key');
    await dropIndex('users_facebook_id_null_store_key');

    // Restore original unique constraints
    await sequelize.query(
      `ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)`,
      { transaction }
    ).catch(() => {});
    await sequelize.query(
      `ALTER TABLE users ADD CONSTRAINT users_google_id_key UNIQUE (google_id)`,
      { transaction }
    ).catch(() => {});
    await sequelize.query(
      `ALTER TABLE users ADD CONSTRAINT users_facebook_id_key UNIQUE (facebook_id)`,
      { transaction }
    ).catch(() => {});
  }
};
