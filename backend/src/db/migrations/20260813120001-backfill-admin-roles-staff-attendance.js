'use strict';

/**
 * Grant staff attendance (shift report + off-shift login approval) to existing technical staff roles.
 * Super admins already receive every key via fullAdminPermissions().
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"staff_attendance": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NULL OR NOT (permissions ? 'staff_attendance')`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'staff_attendance',
           updated_at = NOW()
       WHERE permissions ? 'staff_attendance'`
    );
  }
};
