'use strict';

/**
 * Grant welcome_signup_bonus to all technical-staff admin roles by default.
 * Super admin (master_admin without admin_role_id) already has fullAdminPermissions.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"welcome_signup_bonus": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'welcome_signup_bonus')::boolean, false) = false`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'welcome_signup_bonus',
           updated_at = NOW()
       WHERE permissions ? 'welcome_signup_bonus'`,
      { transaction }
    );
  }
};
