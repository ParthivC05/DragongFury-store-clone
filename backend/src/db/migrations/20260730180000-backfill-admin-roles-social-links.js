'use strict';

/**
 * Grant social_links to Technical Staff admin roles so they can manage
 * landing-page social links for any store (same as super admin via Store Detail).
 * Super admin (master_admin without admin_role_id) already has fullAdminPermissions.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"social_links": true}'::jsonb,
           updated_at = NOW()
       WHERE (
         LOWER(TRIM(slug)) IN ('technical', 'technical-staff', 'techincal-staff', 'techincal')
         OR LOWER(name) LIKE '%technical%'
         OR LOWER(name) LIKE '%techincal%'
       )
       AND COALESCE((permissions->>'social_links')::boolean, false) = false`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = jsonb_set(permissions, '{social_links}', 'false'::jsonb, true),
           updated_at = NOW()
       WHERE LOWER(TRIM(slug)) IN ('technical', 'technical-staff', 'techincal-staff', 'techincal')
          OR LOWER(name) LIKE '%technical%'
          OR LOWER(name) LIKE '%techincal%'`,
      { transaction }
    );
  }
};
