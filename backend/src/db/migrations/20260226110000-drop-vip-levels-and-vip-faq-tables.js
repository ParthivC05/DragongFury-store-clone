'use strict';

/** Drop vip_levels and vip_faq. VIP config now lives only in settings (key vip_settings). */

const TABLE_FAQ = 'vip_faq';
const TABLE_LEVELS = 'vip_levels';

module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable(TABLE_FAQ);
    await queryInterface.dropTable(TABLE_LEVELS);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable(TABLE_LEVELS, {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      level_index: { type: Sequelize.INTEGER, allowNull: false, unique: true },
      name: { type: Sequelize.STRING(32), allowNull: false },
      xp_to_next_level: { type: Sequelize.INTEGER, allowNull: false },
      level_up_reward_sc: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
      withdrawal_limit: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      platform_withdrawal_limit: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable(TABLE_FAQ, {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      question: { type: Sequelize.TEXT, allowNull: false },
      answer: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  }
};
