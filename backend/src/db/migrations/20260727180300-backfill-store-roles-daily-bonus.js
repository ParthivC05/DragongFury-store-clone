'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"daily_bonus": true}'::jsonb,
           updated_at = NOW()
       WHERE (
         COALESCE((permissions->>'daily_bonus')::boolean, false) = false
       )
       AND (
         COALESCE((permissions->>'deposit_bonuses')::boolean, false) = true
         OR COALESCE((permissions->>'bonus_codes')::boolean, false) = true
         OR COALESCE((permissions->>'affiliate')::boolean, false) = true
         OR COALESCE((permissions->>'spin_wheel')::boolean, false) = true
         OR COALESCE((permissions->>'vip')::boolean, false) = true
         OR COALESCE((permissions->>'welcome_signup_bonus')::boolean, false) = true
         OR COALESCE((permissions->>'deposit_packages')::boolean, false) = true
       )`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'daily_bonus',
           updated_at = NOW()
       WHERE permissions ? 'daily_bonus'`,
      { transaction }
    );
  }
};
