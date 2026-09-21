'use strict';

/**
 * Grant welcome_signup_bonus to store roles that already manage similar promo features,
 * so store staff keep access without a manual role edit after deploy.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"welcome_signup_bonus": true}'::jsonb,
           updated_at = NOW()
       WHERE (
         COALESCE((permissions->>'welcome_signup_bonus')::boolean, false) = false
       )
       AND (
         COALESCE((permissions->>'deposit_bonuses')::boolean, false) = true
         OR COALESCE((permissions->>'bonus_codes')::boolean, false) = true
         OR COALESCE((permissions->>'affiliate')::boolean, false) = true
         OR COALESCE((permissions->>'spin_wheel')::boolean, false) = true
         OR COALESCE((permissions->>'vip')::boolean, false) = true
       )`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'welcome_signup_bonus',
           updated_at = NOW()
       WHERE permissions ? 'welcome_signup_bonus'`,
      { transaction }
    );
  }
};
