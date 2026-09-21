'use strict';

/**
 * Grant support_tickets to roles that already manage help content or game manual requests.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"support_tickets": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'help_content')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests_register')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests_deposit')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests_redeem')::boolean, false) = true`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"support_tickets": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'help_content')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests_register')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests_deposit')::boolean, false) = true
          OR COALESCE((permissions->>'game_manual_requests_redeem')::boolean, false) = true`,
      { transaction }
    );
  },

  async down() {
    // no-op: keep granted support_tickets
  }
};
