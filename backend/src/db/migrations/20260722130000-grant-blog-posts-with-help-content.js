'use strict';

/**
 * Grant blog_posts to roles that already manage help content.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"blog_posts": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'help_content')::boolean, false) = true`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"blog_posts": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'help_content')::boolean, false) = true`,
      { transaction }
    );
  },

  async down() {
    // no-op: keep granted blog_posts
  }
};
