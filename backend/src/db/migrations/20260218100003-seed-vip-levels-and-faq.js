'use strict';

const TABLE_LEVELS = 'vip_levels';
const TABLE_FAQ = 'vip_faq';

const LEVELS = [
  { level_index: 0, name: 'Iron', xp_to_next_level: 500, level_up_reward_sc: 2, withdrawal_limit: 500, platform_withdrawal_limit: 400 },
  { level_index: 1, name: 'Bronze', xp_to_next_level: 1000, level_up_reward_sc: 5, withdrawal_limit: 1000, platform_withdrawal_limit: 800 },
  { level_index: 2, name: 'Silver', xp_to_next_level: 2500, level_up_reward_sc: 10, withdrawal_limit: 2500, platform_withdrawal_limit: 2000 },
  { level_index: 3, name: 'Gold', xp_to_next_level: 5000, level_up_reward_sc: 25, withdrawal_limit: 5000, platform_withdrawal_limit: 4000 },
  { level_index: 4, name: 'Platinum', xp_to_next_level: 10000, level_up_reward_sc: 50, withdrawal_limit: 10000, platform_withdrawal_limit: 8000 },
  { level_index: 5, name: 'Diamond', xp_to_next_level: 25000, level_up_reward_sc: 100, withdrawal_limit: 25000, platform_withdrawal_limit: 20000 }
];

const FAQ = [
  { question: 'Why should I become a VIP Club member?', answer: 'Once you join, your gaming experience will soar to new heights. You will benefit from weekly Coins Back, rewards for each level-up, and special privileges that unlock as you progress in VIP Club.', sort_order: 1 },
  { question: 'How do I join VIP Club?', answer: 'You automatically join when you start playing. Earn XP from deposits, gameplay, and referrals to level up through Iron, Bronze, Silver, Gold, Platinum, and Diamond.', sort_order: 2 },
  { question: 'What is the Coins Back reward?', answer: 'Coins Back is a weekly bonus based on your VIP level. Higher tiers earn a higher percentage of their eligible activity as bonus credits.', sort_order: 3 },
  { question: 'How to get Coins Back?', answer: 'Coins Back is calculated and credited automatically each week. No action needed—just play and level up to increase your percentage.', sort_order: 4 },
  { question: 'How is my Coins Back reward calculated?', answer: 'Your VIP level determines your platform bonus percentage. Each week we apply this percentage to your eligible activity (e.g. deposits or play) and credit the amount to your wallet.', sort_order: 5 },
  { question: 'What are Exclusive Offers?', answer: 'As you reach higher VIP levels, you unlock exclusive offers, higher withdrawal limits, and access to premium wheels and rewards.', sort_order: 6 }
];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, transaction });

    for (const row of LEVELS) {
      await q(
        `INSERT INTO ${TABLE_LEVELS} (level_index, name, xp_to_next_level, level_up_reward_sc, withdrawal_limit, platform_withdrawal_limit)
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
    for (const row of FAQ) {
      await q(
        `INSERT INTO ${TABLE_FAQ} (question, answer, sort_order)
         VALUES (:question, :answer, :sort_order)
         ON CONFLICT (question) DO UPDATE SET
           answer = EXCLUDED.answer,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        row
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DELETE FROM ${TABLE_FAQ}`);
    await q(`DELETE FROM ${TABLE_LEVELS}`);
  }
};
