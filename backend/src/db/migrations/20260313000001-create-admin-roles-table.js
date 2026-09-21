'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'admin_roles',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(128), allowNull: false },
        slug: { type: Sequelize.STRING(64), allowNull: false },
        permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS admin_roles_slug_key ON admin_roles (slug)',
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('admin_roles', { transaction });
  }
};
