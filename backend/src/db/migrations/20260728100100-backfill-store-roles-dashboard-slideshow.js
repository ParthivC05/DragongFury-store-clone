'use strict';

/**
 * Grant dashboard_slideshow to store roles that already manage similar site content features.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"dashboard_slideshow": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'dashboard_slideshow')::boolean, false) = false
         AND (
           COALESCE((permissions->>'social_links')::boolean, false) = true
           OR COALESCE((permissions->>'help_content')::boolean, false) = true
           OR COALESCE((permissions->>'blog_posts')::boolean, false) = true
           OR COALESCE((permissions->>'landing_payment_links')::boolean, false) = true
         )`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'dashboard_slideshow',
           updated_at = NOW()
       WHERE permissions ? 'dashboard_slideshow'`,
      { transaction }
    );
  }
};
