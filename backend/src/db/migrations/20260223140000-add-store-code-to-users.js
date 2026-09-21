'use strict';

/** Add store_code to users. Store admins and users under a store are scoped by distributor_code + store_code. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'store_code'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn(
        'users',
        'store_code',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction }
      );
    }
    // Backfill store_admin rows that have null store_code so they can still access dashboard/users
    const [rows] = await queryInterface.sequelize.query(
      `SELECT user_id, username FROM users WHERE role = 'store_admin' AND store_code IS NULL`,
      { transaction }
    );
    for (const row of rows) {
      const slug = (row.username || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) || `store${row.user_id}`;
      await queryInterface.sequelize.query(
        `UPDATE users SET store_code = :slug WHERE user_id = :id`,
        { replacements: { slug, id: row.user_id }, transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'store_code', { transaction });
  }
};
