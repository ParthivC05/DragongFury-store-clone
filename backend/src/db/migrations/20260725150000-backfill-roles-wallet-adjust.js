'use strict';

/**
 * Add wallet_adjust to existing store/admin roles without breaking current behavior.
 *
 * Before this feature, Users access implied add/remove SC. Preserve that:
 * - roles with users_list / users → wallet_adjust true
 * - otherwise → wallet_adjust false
 *
 * Full store/master admins (no role id) already receive all keys via full*Permissions().
 * New roles created in the UI start with wallet_adjust unchecked (opt-in).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;

    // Store roles that already had Users (could adjust SC before) keep the ability.
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"wallet_adjust": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'wallet_adjust')
         AND COALESCE((permissions->>'users_list')::boolean, false) = true`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"wallet_adjust": false}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'wallet_adjust')`,
      { transaction }
    );

    // Admin (technical staff) roles with Users keep wallet adjust.
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"wallet_adjust": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'wallet_adjust')
         AND COALESCE((permissions->>'users')::boolean, false) = true`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"wallet_adjust": false}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'wallet_adjust')`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'wallet_adjust',
           updated_at = NOW()
       WHERE permissions ? 'wallet_adjust'`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'wallet_adjust',
           updated_at = NOW()
       WHERE permissions ? 'wallet_adjust'`,
      { transaction }
    );
  }
};
