'use strict';

/**
 * Enable footer_pages on all existing roles so the Footer pages nav item is visible.
 * Admins can turn it off per role afterward if needed.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE store_roles
      SET permissions = permissions || '{"footer_pages": true}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
    `);

    await q(`
      UPDATE admin_roles
      SET permissions = permissions
            || '{"footer_pages": true}'::jsonb
            || CASE
                 WHEN NOT (permissions ? 'footer_pages_store_scope')
                 THEN '{"footer_pages_store_scope": "all", "footer_pages_store_codes": []}'::jsonb
                 ELSE '{}'::jsonb
               END,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
    `);
  },

  async down() {
    // keep grants
  }
};
