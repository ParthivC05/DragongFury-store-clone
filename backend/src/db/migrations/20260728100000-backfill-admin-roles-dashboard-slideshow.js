'use strict';

/**
 * Grant dashboard_slideshow to all technical-staff admin roles by default.
 * Super admin (master_admin without admin_role_id) already has fullAdminPermissions.
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
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'dashboard_slideshow',
           updated_at = NOW()
       WHERE permissions ? 'dashboard_slideshow'`,
      { transaction }
    );
  }
};
