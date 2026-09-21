'use strict';

const TABLE = 'vip_levels';

/** Level data: same as seed, without platform_bonus_pct. UPSERT so existing rows get correct values. */
const LEVELS = [
  { level_index: 0, name: 'Iron', xp_to_next_level: 500, level_up_reward_sc: 2, withdrawal_limit: 500, platform_withdrawal_limit: 400 },
  { level_index: 1, name: 'Bronze', xp_to_next_level: 1000, level_up_reward_sc: 5, withdrawal_limit: 1000, platform_withdrawal_limit: 800 },
  { level_index: 2, name: 'Silver', xp_to_next_level: 2500, level_up_reward_sc: 10, withdrawal_limit: 2500, platform_withdrawal_limit: 2000 },
  { level_index: 3, name: 'Gold', xp_to_next_level: 5000, level_up_reward_sc: 25, withdrawal_limit: 5000, platform_withdrawal_limit: 4000 },
  { level_index: 4, name: 'Platinum', xp_to_next_level: 10000, level_up_reward_sc: 50, withdrawal_limit: 10000, platform_withdrawal_limit: 8000 },
  { level_index: 5, name: 'Diamond', xp_to_next_level: 25000, level_up_reward_sc: 100, withdrawal_limit: 25000, platform_withdrawal_limit: 20000 }
];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, transaction });

    await q(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS platform_bonus_pct`);

    for (const row of LEVELS) {
      await q(
        `INSERT INTO ${TABLE} (level_index, name, xp_to_next_level, level_up_reward_sc, withdrawal_limit, platform_withdrawal_limit)
         VALUES (:level_index, :name, :xp_to_next_level, :level_up_reward_sc, :withdrawal_limit, :platform_withdrawal_limit)
         ON CONFLICT (level_index) DO UPDATE SET
           name = EXCLUDED.name,
           xp_to_next_level = EXCLUDED.xp_to_next_level,
           level_up_reward_sc = EXCLUDED.level_up_reward_sc,
           withdrawal_limit = EXCLUDED.withdrawal_limit,
           platform_withdrawal_limit = EXCLUDED.platform_withdrawal_limit,
           updated_at = NOW()`,
        row
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS platform_bonus_pct DECIMAL(5,2) NOT NULL DEFAULT 0`,
      { transaction }
    );
  }
};
