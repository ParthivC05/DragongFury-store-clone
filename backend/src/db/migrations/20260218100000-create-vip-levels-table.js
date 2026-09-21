'use strict';

const TABLE = 'vip_levels';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        level_index INTEGER NOT NULL UNIQUE,
        name VARCHAR(32) NOT NULL,
        xp_to_next_level INTEGER NOT NULL,
        level_up_reward_sc DECIMAL(18,2) NOT NULL DEFAULT 0,
        withdrawal_limit DECIMAL(18,2) NOT NULL,
        platform_withdrawal_limit DECIMAL(18,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    await queryInterface.dropTable(TABLE, { transaction: opts.transaction });
  }
};
