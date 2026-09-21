'use strict';

/**
 * Add footer_pages permission key to existing store/admin roles (default false).
 * Admin roles also get footer_pages_store_scope = 'all' and empty store codes.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE store_roles
      SET permissions = permissions || '{"footer_pages": false}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
        AND NOT (permissions ? 'footer_pages')
    `);

    await q(`
      UPDATE admin_roles
      SET permissions = permissions
            || '{"footer_pages": false, "footer_pages_store_scope": "all", "footer_pages_store_codes": []}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
        AND NOT (permissions ? 'footer_pages')
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE store_roles
      SET permissions = permissions - 'footer_pages',
          updated_at = NOW()
      WHERE permissions ? 'footer_pages'
    `);

    await q(`
      UPDATE admin_roles
      SET permissions = (permissions - 'footer_pages' - 'footer_pages_store_scope' - 'footer_pages_store_codes'),
          updated_at = NOW()
      WHERE permissions ? 'footer_pages'
         OR permissions ? 'footer_pages_store_scope'
         OR permissions ? 'footer_pages_store_codes'
    `);
  }
};
