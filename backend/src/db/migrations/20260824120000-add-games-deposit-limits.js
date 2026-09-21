'use strict';

/**
 * Add min_deposit_limit and max_deposit_limit to games so store admins can
 * set per-game deposit ranges. 0 max means unlimited.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games'
       AND column_name IN ('min_deposit_limit', 'max_deposit_limit')`,
      { transaction }
    );
    const present = (cols || []).map((r) => r.column_name);
    if (!present.includes('min_deposit_limit')) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN min_deposit_limit DECIMAL(18,2) NOT NULL DEFAULT 0`,
        { transaction }
      );
    }
    if (!present.includes('max_deposit_limit')) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN max_deposit_limit DECIMAL(18,2) NOT NULL DEFAULT 0`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`ALTER TABLE games DROP COLUMN IF EXISTS min_deposit_limit`, { transaction });
    await sequelize.query(`ALTER TABLE games DROP COLUMN IF EXISTS max_deposit_limit`, { transaction });
  }
};
