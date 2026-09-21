'use strict';

/** Add pending_free_spins and is_admin to users for spin wheel and admin settings. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('pending_free_spins', 'is_admin')`,
      { transaction }
    );
    const names = (cols || []).map((r) => r.column_name);
    if (!names.includes('pending_free_spins')) {
      await q.addColumn(
        'users',
        'pending_free_spins',
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction }
      );
    }
    if (!names.includes('is_admin')) {
      await q.addColumn(
        'users',
        'is_admin',
        { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'pending_free_spins', { transaction }).catch(() => {});
    await queryInterface.removeColumn('users', 'is_admin', { transaction }).catch(() => {});
  }
};
