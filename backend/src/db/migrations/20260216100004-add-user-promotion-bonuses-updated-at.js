'use strict';

const USER_PROMOTION_BONUSES_TABLE = 'user_promotion_bonuses';

/** Add updated_at for tables created before it was added to the schema (Sequelize timestamps). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${USER_PROMOTION_BONUSES_TABLE}
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${USER_PROMOTION_BONUSES_TABLE}
      DROP COLUMN IF EXISTS updated_at
    `);
  }
};
