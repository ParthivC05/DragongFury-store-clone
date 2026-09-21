'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'store_roles',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        distributor_code: { type: Sequelize.STRING(64), allowNull: false },
        store_code: { type: Sequelize.STRING(64), allowNull: false },
        platform_role_id: { type: Sequelize.INTEGER, allowNull: true },
        name: { type: Sequelize.STRING(128), allowNull: false },
        permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS store_roles_dist_store_idx ON store_roles (distributor_code, store_code)',
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('store_roles', { transaction });
  }
};
