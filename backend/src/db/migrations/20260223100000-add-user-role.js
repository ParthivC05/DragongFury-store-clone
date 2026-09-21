'use strict';

/** Add role column to users. Values: master_admin, distributor_admin, store_admin, store_user, user. Backfill: is_admin = true -> role = master_admin. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await q.addColumn(
        'users',
        'role',
        { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'user' },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE users SET role = 'master_admin' WHERE is_admin = true`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'role', { transaction });
  }
};
