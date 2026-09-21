'use strict';

/**
 * Seed Gameroom Agent API game template.
 * Existing Gameroom bot templates/games keep working via game_key gameroom / streamlit flow.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'gameroomagent'
       LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Gameroom (Agent)',
        game_key: 'gameroom_agent',
        streamlit_token: null,
        bot_base_url: 'https://agentserver.gameroom777.com',
        game_link: 'https://gameroom777.com',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'gameroomagent'`
    ).catch(() => {});
  }
};
