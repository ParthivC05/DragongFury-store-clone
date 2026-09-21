'use strict';

/**
 * Re-grant dashboard_slideshow on all admin_roles so technical staff / super-admin
 * roles can open the all-stores Dashboard slideshow page after deploy.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"dashboard_slideshow": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'dashboard_slideshow')::boolean, false) = false`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    // Keep granted permissions; no-op down.
  }
};
