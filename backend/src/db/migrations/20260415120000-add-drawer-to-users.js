'use strict';

/** Golden Dragon provider: moneybox value set per store (main store admin). Sent as `moneybox` on POST /admin/add-client. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'drawer'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn('users', 'drawer', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, { transaction });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'drawer');
  }
};
