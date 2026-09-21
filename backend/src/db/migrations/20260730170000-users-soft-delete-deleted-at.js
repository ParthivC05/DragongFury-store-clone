'use strict';

/**
 * Soft-delete support for store wipe:
 * - Add users.deleted_at
 * - Rebuild per-store unique indexes so soft-deleted rows no longer block recreate/signup
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deleted_at'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn(
        'users',
        'deleted_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction }
      );
    }

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at)`,
      { transaction }
    );

    const dropIndex = async (name) => {
      try {
        await sequelize.query(`DROP INDEX IF EXISTS "${name}"`, { transaction });
      } catch (_) {
        // ignore
      }
    };

    // Recreate email / SSO unique indexes excluding soft-deleted users
    await dropIndex('users_email_store_code_key');
    await dropIndex('users_email_null_store_key');
    await dropIndex('users_google_id_store_code_key');
    await dropIndex('users_google_id_null_store_key');
    await dropIndex('users_facebook_id_store_code_key');
    await dropIndex('users_facebook_id_null_store_key');

    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_store_code_key
       ON users (email, store_code)
       WHERE store_code IS NOT NULL AND deleted_at IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_null_store_key
       ON users (email)
       WHERE store_code IS NULL AND deleted_at IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_store_code_key
       ON users (google_id, store_code)
       WHERE google_id IS NOT NULL AND store_code IS NOT NULL AND deleted_at IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_null_store_key
       ON users (google_id)
       WHERE google_id IS NOT NULL AND store_code IS NULL AND deleted_at IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_store_code_key
       ON users (facebook_id, store_code)
       WHERE facebook_id IS NOT NULL AND store_code IS NOT NULL AND deleted_at IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_null_store_key
       ON users (facebook_id)
       WHERE facebook_id IS NOT NULL AND store_code IS NULL AND deleted_at IS NULL`,
      { transaction }
    );

    // Username unique indexes — exclude soft-deleted
    await dropIndex('users_username_store_code_key');
    await dropIndex('users_username_null_store_key');
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_store_code_key
       ON users (LOWER(username), store_code)
       WHERE store_code IS NOT NULL AND username IS NOT NULL AND deleted_at IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_null_store_key
       ON users (LOWER(username))
       WHERE store_code IS NULL AND username IS NOT NULL AND deleted_at IS NULL`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const dropIndex = async (name) => {
      try {
        await sequelize.query(`DROP INDEX IF EXISTS "${name}"`, { transaction });
      } catch (_) {
        // ignore
      }
    };

    await dropIndex('users_email_store_code_key');
    await dropIndex('users_email_null_store_key');
    await dropIndex('users_google_id_store_code_key');
    await dropIndex('users_google_id_null_store_key');
    await dropIndex('users_facebook_id_store_code_key');
    await dropIndex('users_facebook_id_null_store_key');
    await dropIndex('users_username_store_code_key');
    await dropIndex('users_username_null_store_key');
    await dropIndex('users_deleted_at_idx');

    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_store_code_key
       ON users (email, store_code) WHERE store_code IS NOT NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_null_store_key
       ON users (email) WHERE store_code IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_store_code_key
       ON users (google_id, store_code) WHERE google_id IS NOT NULL AND store_code IS NOT NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_null_store_key
       ON users (google_id) WHERE google_id IS NOT NULL AND store_code IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_store_code_key
       ON users (facebook_id, store_code) WHERE facebook_id IS NOT NULL AND store_code IS NOT NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_null_store_key
       ON users (facebook_id) WHERE facebook_id IS NOT NULL AND store_code IS NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_store_code_key
       ON users (LOWER(username), store_code) WHERE store_code IS NOT NULL AND username IS NOT NULL`,
      { transaction }
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_null_store_key
       ON users (LOWER(username)) WHERE store_code IS NULL AND username IS NOT NULL`,
      { transaction }
    );

    await queryInterface.removeColumn('users', 'deleted_at', { transaction }).catch(() => {});
  }
};
