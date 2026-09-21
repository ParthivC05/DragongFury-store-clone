'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('google_id', 'facebook_id')`,
      { transaction }
    );
    const existing = (cols || []).map((r) => r.column_name);
    if (!existing.includes('google_id')) {
      await q.addColumn('users', 'google_id', { type: Sequelize.STRING(64), allowNull: true, unique: true }, { transaction });
    }
    if (!existing.includes('facebook_id')) {
      await q.addColumn('users', 'facebook_id', { type: Sequelize.STRING(64), allowNull: true, unique: true }, { transaction });
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    await q.removeColumn('users', 'google_id', { transaction });
    await q.removeColumn('users', 'facebook_id', { transaction });
  }
};
