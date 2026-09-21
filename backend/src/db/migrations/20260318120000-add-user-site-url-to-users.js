'use strict';

/** Public user-facing site URL for this store (verify email, reset password, referral links). Set on store_admin row. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_site_url'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn('users', 'user_site_url', {
        type: Sequelize.STRING(512),
        allowNull: true
      }, { transaction });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'user_site_url');
  }
};
