'use strict';

/** Grant deposit_packages to admin roles that already manage similar promo features. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"deposit_packages": true}'::jsonb,
           updated_at = NOW()
       WHERE (
         COALESCE((permissions->>'deposit_packages')::boolean, false) = false
       )
       AND (
         COALESCE((permissions->>'deposit_bonuses')::boolean, false) = true
         OR COALESCE((permissions->>'bonus_codes')::boolean, false) = true
         OR COALESCE((permissions->>'payment_providers')::boolean, false) = true
       )`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'deposit_packages',
           updated_at = NOW()
       WHERE permissions ? 'deposit_packages'`,
      { transaction }
    );
  }
};
