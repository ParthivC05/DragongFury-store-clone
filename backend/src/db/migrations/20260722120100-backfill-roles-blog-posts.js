'use strict';

/**
 * Add blog_posts permission key to existing store/admin roles (default false).
 * Full store/master admins (no role id) already receive all keys via full*Permissions().
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"blog_posts": false}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'blog_posts')`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"blog_posts": false}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'blog_posts')`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'blog_posts',
           updated_at = NOW()
       WHERE permissions ? 'blog_posts'`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'blog_posts',
           updated_at = NOW()
       WHERE permissions ? 'blog_posts'`,
      { transaction }
    );
  }
};
