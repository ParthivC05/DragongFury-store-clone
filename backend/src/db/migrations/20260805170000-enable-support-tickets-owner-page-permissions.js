'use strict';

/**
 * Ensure primary store owners can grant Support tickets to store staff.
 * Owner page-permission roles may predate support_tickets and block granting via canGrantKey.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"support_tickets": true}'::jsonb,
           updated_at = NOW()
       WHERE slug = '__owner_page_permissions'`,
      { transaction }
    );
  },

  async down() {
    // no-op: keep owner support_tickets grants
  }
};
