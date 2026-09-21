'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'distributors',
      {
        distributor_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(255), allowNull: false },
        code: { type: Sequelize.STRING(64), allowNull: true, unique: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('distributors', { transaction });
  }
};
