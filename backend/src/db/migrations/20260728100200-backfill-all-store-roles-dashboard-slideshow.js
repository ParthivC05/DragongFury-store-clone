'use strict';

/**
 * Ensure every store_role can access dashboard slideshow in the admin sidebar.
 * Earlier backfill only targeted roles that already had related content features.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"dashboard_slideshow": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'dashboard_slideshow')::boolean, false) = false`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    // Keep permission keys; no-op down to avoid stripping intentionally granted access.
  }
};
