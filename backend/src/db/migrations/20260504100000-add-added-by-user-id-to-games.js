'use strict';

/** Who created the store game (users.user_id). Null = legacy row or platform-level game. Idempotent. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'added_by_user_id'`,
      { transaction }
    );
    if (cols.length > 0) return;

    await queryInterface.addColumn(
      'games',
      'added_by_user_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      { transaction }
    );
    await queryInterface.addIndex('games', ['added_by_user_id'], {
      name: 'games_added_by_user_id_idx',
      transaction
    });
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeIndex('games', 'games_added_by_user_id_idx', { transaction }).catch(() => {});
    await queryInterface.removeColumn('games', 'added_by_user_id', { transaction }).catch(() => {});
  }
};
