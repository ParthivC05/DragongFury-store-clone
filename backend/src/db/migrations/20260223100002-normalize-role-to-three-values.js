'use strict';

/** Normalize users.role to exactly 4 values: master_admin, distributor_admin, store_admin, user. Any other value (e.g. store_user) becomes user. */
const VALID_ROLES = ['master_admin', 'distributor_admin', 'store_admin', 'user'];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN (${VALID_ROLES.map((r) => `'${r}'`).join(',')})`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    // No reversible mapping
  }
};
