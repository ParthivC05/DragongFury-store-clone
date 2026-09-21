'use strict';

/**
 * Add All stores / One store scope keys for blog posts on existing admin roles.
 * Existing roles keep all-store access until a super admin picks one store.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE admin_roles
      SET permissions = permissions
            || '{"blog_posts_store_scope": "all", "blog_posts_store_codes": []}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
        AND NOT (permissions ? 'blog_posts_store_scope')
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE admin_roles
      SET permissions = (permissions - 'blog_posts_store_scope' - 'blog_posts_store_codes'),
          updated_at = NOW()
      WHERE permissions ? 'blog_posts_store_scope'
         OR permissions ? 'blog_posts_store_codes'
    `);
  }
};
