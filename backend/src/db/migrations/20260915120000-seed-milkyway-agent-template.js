'use strict';

/**
 * Seed Milkyway Agent API game template (MW Terminal API).
 * Existing Milkyway bot templates/games keep working via game_key milkyway / streamlit flow.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'milkywayagent'
       LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Milkyway (Agent)',
        game_key: 'milkyway_agent',
        streamlit_token: null,
        bot_base_url: 'https://milkywayapp.xyz:8033',
        game_link: 'https://milkywayapp.xyz/',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }

    await queryInterface.sequelize.query(`
      UPDATE games
      SET game_key = 'milkyway'
      WHERE game_key IS NULL
        AND LOWER(REPLACE(REPLACE(REPLACE(TRIM(name), ' ', ''), '_', ''), '-', '')) = 'milkyway'
        AND bot_api_key IS NOT NULL
        AND streamlit_token IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'milkywayagent'`
    ).catch(() => {});
  }
};
