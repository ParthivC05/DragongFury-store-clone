'use strict';

/**
 * Seed original Juwa Agent API game template.
 * Same GameVault-style /api/external/* APIs as Juwa 2.0 Agent.
 * Existing Juwa bot templates/games keep working via game_key juwa / streamlit flow.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwaagent'
       LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Juwa (Agent)',
        game_key: 'juwa_agent',
        streamlit_token: null,
        bot_base_url: 'https://external.juwa777.com',
        game_link: 'https://www.juwa777.com',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwaagent'`
    ).catch(() => {});
  }
};
