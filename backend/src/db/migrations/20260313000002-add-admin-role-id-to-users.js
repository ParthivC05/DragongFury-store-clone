'use strict';

/**
 * Add admin_role_id to users. When role=master_admin and admin_role_id is set, user has only that role's permissions.
 * Schema: users.admin_role_id INTEGER NULL, FK to admin_roles(id) ON DELETE SET NULL, constraint name users_admin_role_id_fkey.
 * Idempotent: if the column or constraint already exists (e.g. from a previous partial run), this migration no-ops
 * so it does not affect existing setups and allows later migrations (e.g. game_templates) to run.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const run = (sql) => sequelize.query(sql, { transaction });

    // Same as original: add column admin_role_id INTEGER NULL (only if missing)
    await run(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role_id INTEGER NULL
    `);

    // Same as original: add FK users_admin_role_id_fkey -> admin_roles(id) ON DELETE SET NULL (only if missing)
    const [rows] = await sequelize.query(
      `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_admin_role_id_fkey') AS exists`,
      { transaction }
    );
    const constraintExists = Boolean(rows && rows[0] && rows[0].exists);
    if (!constraintExists) {
      await run(`
        ALTER TABLE users
        ADD CONSTRAINT users_admin_role_id_fkey
        FOREIGN KEY (admin_role_id) REFERENCES admin_roles(id) ON DELETE SET NULL
      `);
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    // Original behavior: remove constraint then column. Use try/catch so down() is safe if run twice or partially applied.
    try {
      await queryInterface.removeConstraint('users', 'users_admin_role_id_fkey', { transaction });
    } catch (_) {
      // Constraint may already be missing
    }
    try {
      await queryInterface.removeColumn('users', 'admin_role_id', { transaction });
    } catch (_) {
      // Column may already be missing
    }
  }
};
