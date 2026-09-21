'use strict';

/**
 * Seed Cashmachine Agent API game template.
 * Existing CashMachine777 bot templates/games keep working via game_key cashmachine777 / streamlit flow.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) IN ('cashmachineagent', 'cashmachine777agent')
       LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'CashMachine777 (Agent)',
        game_key: 'cashmachine_agent',
        streamlit_token: null,
        bot_base_url: 'https://agentserver.cashmachine777.com',
        game_link: 'https://www.cashmachine777.com',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) IN ('cashmachineagent', 'cashmachine777agent')`
    ).catch(() => {});
  }
};
