'use strict';

/** Track when admin password was last reset. Used to skip OTP for login within 10 min after reset (avoids duplicate emails). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_reset_at'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn('users', 'password_reset_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'password_reset_at');
  }
};
