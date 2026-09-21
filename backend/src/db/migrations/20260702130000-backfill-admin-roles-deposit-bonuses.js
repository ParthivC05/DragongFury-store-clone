'use strict';

/** Grant deposit_bonuses to admin roles that already manage similar promo features. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"deposit_bonuses": true}'::jsonb,
           updated_at = NOW()
       WHERE (
         COALESCE((permissions->>'deposit_bonuses')::boolean, false) = false
       )
       AND (
         COALESCE((permissions->>'bonus_codes')::boolean, false) = true
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
      `UPDATE admin_roles
       SET permissions = permissions - 'deposit_bonuses',
           updated_at = NOW()
       WHERE permissions ? 'deposit_bonuses'`,
      { transaction }
    );
  }
};
