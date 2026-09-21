'use strict';

/**
 * Ensure every admin role can manage footer CMS for all stores
 * (technical staff + any other roles). Super admins already have full access.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements });
    await q(`
      UPDATE admin_roles
      SET permissions = COALESCE(permissions, '{}'::jsonb)
            || '{"footer_pages": true, "footer_pages_store_scope": "all", "footer_pages_store_codes": []}'::jsonb,
          updated_at = NOW()
    `);
  },

  async down() {
    // Keep footer access enabled
  }
};
