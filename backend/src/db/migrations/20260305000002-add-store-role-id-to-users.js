'use strict';

/** Add store_role_id to users. When role=store_admin and store_role_id is set, user has only that role's permissions. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'store_role_id'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn(
        'users',
        'store_role_id',
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction }
      );
      await queryInterface.addConstraint('users', {
        type: 'foreign key',
        fields: ['store_role_id'],
        name: 'users_store_role_id_fkey',
        references: { table: 'store_roles', field: 'id' },
        onDelete: 'SET NULL',
        transaction
      });
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeConstraint('users', 'users_store_role_id_fkey', { transaction });
    await queryInterface.removeColumn('users', 'store_role_id', { transaction });
  }
};
