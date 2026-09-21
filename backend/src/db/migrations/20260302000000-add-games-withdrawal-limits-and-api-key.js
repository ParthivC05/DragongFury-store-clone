'use strict';

/**
 * Add min_withdrawal_limit, max_withdrawal_limit, and bot_api_key to games table.
 * Idempotent: only adds columns if missing.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games'
       AND column_name IN ('min_withdrawal_limit', 'max_withdrawal_limit', 'bot_api_key')`,
      { transaction }
    );
    const present = (cols || []).map((r) => r.column_name);
    if (!present.includes('min_withdrawal_limit')) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN min_withdrawal_limit DECIMAL(18,2) NOT NULL DEFAULT 0`,
        { transaction }
      );
    }
    if (!present.includes('max_withdrawal_limit')) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN max_withdrawal_limit DECIMAL(18,2) NOT NULL DEFAULT 500`,
        { transaction }
      );
    }
    if (!present.includes('bot_api_key')) {
      await sequelize.query(
        `ALTER TABLE games ADD COLUMN bot_api_key VARCHAR(512)`,
        { transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`ALTER TABLE games DROP COLUMN IF EXISTS min_withdrawal_limit`, { transaction });
    await sequelize.query(`ALTER TABLE games DROP COLUMN IF EXISTS max_withdrawal_limit`, { transaction });
    await sequelize.query(`ALTER TABLE games DROP COLUMN IF EXISTS bot_api_key`, { transaction });
  }
};
