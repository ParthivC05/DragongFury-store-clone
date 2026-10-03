'use strict';

/**
 * Player-facing error log for super admin and technical staff.
 * Safe to run on every server start.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t));
    if (!names.includes('user_error_logs')) {
      await queryInterface.createTable(
        'user_error_logs',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          category: { type: Sequelize.STRING(32), allowNull: false },
          message: { type: Sequelize.TEXT, allowNull: false },
          http_status: { type: Sequelize.INTEGER, allowNull: true },
          error_code: { type: Sequelize.STRING(64), allowNull: true },
          store_code: { type: Sequelize.STRING(64), allowNull: true },
          user_id: { type: Sequelize.INTEGER, allowNull: true },
          email: { type: Sequelize.STRING(255), allowNull: true },
          username: { type: Sequelize.STRING(255), allowNull: true },
          page_url: { type: Sequelize.STRING(512), allowNull: true },
          api_path: { type: Sequelize.STRING(255), allowNull: true },
          http_method: { type: Sequelize.STRING(8), allowNull: true },
          ip_address: { type: Sequelize.STRING(64), allowNull: true },
          user_agent: { type: Sequelize.STRING(512), allowNull: true },
          country_code: { type: Sequelize.STRING(8), allowNull: true },
          country_name: { type: Sequelize.STRING(64), allowNull: true },
          is_vpn: { type: Sequelize.BOOLEAN, allowNull: true },
          details: { type: Sequelize.JSONB, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false }
        },
        { transaction }
      );
      await queryInterface.addIndex('user_error_logs', ['created_at'], { transaction });
      await queryInterface.addIndex('user_error_logs', ['category'], { transaction });
      await queryInterface.addIndex('user_error_logs', ['store_code'], { transaction });
      await queryInterface.addIndex('user_error_logs', ['user_id'], { transaction });
    }

    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"user_error_logs": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'user_error_logs')`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('user_error_logs', { transaction });
  }
};
