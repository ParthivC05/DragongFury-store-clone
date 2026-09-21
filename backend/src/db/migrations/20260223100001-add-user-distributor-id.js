'use strict';

/** Add distributor_id to users. Identifies which distributor (and thus which store/distribution) the user belongs to. master_admin typically has null; distributor_admin, store_admin, and user have it set. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'distributor_id'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await q.addColumn(
        'users',
        'distributor_id',
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction }
      );
    }
    // If role column had store_user, normalize to user (we only use 4 roles now)
    await queryInterface.sequelize.query(
      `UPDATE users SET role = 'user' WHERE role = 'store_user'`,
      { transaction }
    ).catch(() => {});
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'distributor_id', { transaction });
  }
};
