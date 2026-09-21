'use strict';

/**
 * Grant footer_pages to roles that already manage help content or blog posts.
 * Fixes existing technical/store staff who were backfilled with footer_pages: false.
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
        AND (
          COALESCE((permissions->>'help_content')::boolean, false) = true
          OR COALESCE((permissions->>'blog_posts')::boolean, false) = true
        )
    `);

    await q(`
      UPDATE admin_roles
      SET permissions = permissions || '{"footer_pages": true, "footer_pages_store_scope": "all"}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
        AND (
          COALESCE((permissions->>'help_content')::boolean, false) = true
          OR COALESCE((permissions->>'blog_posts')::boolean, false) = true
        )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    // Keep granted footer_pages
  }
};
