'use strict';

/**
 * Replace distributors table with distributor_code on users.
 * - Add distributor_code (unique per distributor_admin).
 * - Backfill from distributors table if it exists.
 * - Drop distributor_id and distributors table.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const sequelize = queryInterface.sequelize;

    const [hasColumn] = await sequelize.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'distributor_code'`,
      { transaction }
    );
    if (!(hasColumn && hasColumn.length)) {
      await q.addColumn(
        'users',
        'distributor_code',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction }
      );
    }

    const [hasDistributors] = await sequelize.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distributors'`,
      { transaction }
    ).catch(() => [[]]);
    if (hasDistributors && hasDistributors.length) {
      await sequelize.query(
        `UPDATE users u SET distributor_code = d.code FROM distributors d WHERE u.distributor_id = d.distributor_id AND u.distributor_id IS NOT NULL`,
        { transaction }
      );
    }

    const [hasDistId] = await sequelize.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'distributor_id'`,
      { transaction }
    );
    if (hasDistId && hasDistId.length) {
      await sequelize.query(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_distributor_id_fkey`,
        { transaction }
      ).catch(() => {});
      await q.removeColumn('users', 'distributor_id', { transaction });
    }

    if (hasDistributors && hasDistributors.length) {
      await sequelize.query(`DROP TABLE IF EXISTS distributors`, { transaction });
    }

    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_distributor_code_distributor_admin_key ON users (distributor_code) WHERE role = 'distributor_admin' AND distributor_code IS NOT NULL`,
      { transaction }
    ).catch(() => {});
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const q = queryInterface;

    await sequelize.query(
      `DROP INDEX IF EXISTS users_distributor_code_distributor_admin_key`,
      { transaction }
    ).catch(() => {});

    await q.createTable(
      'distributors',
      {
        distributor_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(255), allowNull: false },
        code: { type: Sequelize.STRING(64), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );

    await q.addColumn(
      'users',
      'distributor_id',
      { type: Sequelize.INTEGER, allowNull: true },
      { transaction }
    );

    await q.removeColumn('users', 'distributor_code', { transaction }).catch(() => {});
  }
};
