'use strict';

/** Create settings table for app config (wallet_limits, affiliate_settings, currency, etc.). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settings'`,
      { transaction }
    );
    if (cols && cols.length > 0) return;

    await q.createTable(
      'settings',
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        key: {
          type: Sequelize.STRING(128),
          allowNull: false,
          unique: true
        },
        value: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('settings', { transaction }).catch(() => {});
  }
};
