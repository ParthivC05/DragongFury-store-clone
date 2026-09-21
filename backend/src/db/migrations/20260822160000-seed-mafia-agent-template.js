'use strict';

/**
 * Seed Mafia Agent API game template.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'mafiaagent'
       LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Mafia (Agent)',
        game_key: 'mafia_agent',
        streamlit_token: null,
        bot_base_url: 'https://agentserver.mafia77777.com',
        game_link: 'https://www.mafia77777.com',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'mafiaagent'`
    ).catch(() => {});
  }
};
