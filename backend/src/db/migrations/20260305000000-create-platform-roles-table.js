'use strict';

/** Platform (default) roles created by master_admin. Stores get these by default; store_admin can override permissions per store. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'platform_roles',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(128), allowNull: false },
        slug: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('platform_roles', { transaction });
  }
};
