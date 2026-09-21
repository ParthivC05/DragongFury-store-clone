'use strict';

/** Admin panel accounts do not use customer email verification; align existing rows. */
module.exports = {
  async up(queryInterface, _Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE users SET is_email_verified = true
       WHERE role IN ('master_admin', 'distributor_admin', 'store_admin')
          OR is_admin = true`,
      { transaction }
    );
  },
  async down() {
    // Data-only migration; no safe revert.
  }
};
