'use strict';

/**
 * Grant link2play to DragonFury store roles that already manage blog / landing content,
 * and to admin roles that already manage blog posts.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"link2play": true}'::jsonb,
           updated_at = NOW()
       WHERE LOWER(REGEXP_REPLACE(COALESCE(store_code, ''), '[^a-z0-9]', '', 'g')) = 'dragonfury'
         AND (
           COALESCE((permissions->>'blog_posts')::boolean, false) = true
           OR COALESCE((permissions->>'landing_payment_links')::boolean, false) = true
           OR COALESCE((permissions->>'help_content')::boolean, false) = true
         )`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"link2play": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'blog_posts')::boolean, false) = true
          OR COALESCE((permissions->>'landing_payment_links')::boolean, false) = true`,
      { transaction }
    );
  },

  async down() {
    // no-op: keep granted link2play
  }
};
