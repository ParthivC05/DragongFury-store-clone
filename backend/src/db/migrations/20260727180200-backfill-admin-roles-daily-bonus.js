'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"daily_bonus": true}'::jsonb,
           updated_at = NOW()
       WHERE COALESCE((permissions->>'daily_bonus')::boolean, false) = false`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'daily_bonus',
           updated_at = NOW()
       WHERE permissions ? 'daily_bonus'`,
      { transaction }
    );
  }
};
