'use strict';

/**
 * Add streamlit_token to games table for storing game provider token (from admin request).
 * Idempotent: only adds column if missing.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games'
       AND column_name = 'streamlit_token'`,
      { transaction }
    );
    if ((cols || []).length === 0) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN streamlit_token VARCHAR(512)`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE games DROP COLUMN IF EXISTS streamlit_token`,
      { transaction }
    );
  }
};
