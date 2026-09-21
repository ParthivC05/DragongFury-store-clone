'use strict';

/**
 * Seed Firekirin Agent API game template (MW Terminal API).
 * Existing Firekirin bot templates/games keep working via game_key firekirin / streamlit flow.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'firekirinagent'
       LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Firekirin (Agent)',
        game_key: 'firekirin_agent',
        streamlit_token: null,
        bot_base_url: 'https://firekirin.xyz:8033',
        game_link: 'https://start.firekirin.xyz:8580/index.html',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }

    // Ensure existing Firekirin bot rows have an explicit bot game_key when missing.
    await queryInterface.sequelize.query(`
      UPDATE games
      SET game_key = 'firekirin'
      WHERE game_key IS NULL
        AND LOWER(REPLACE(REPLACE(REPLACE(TRIM(name), ' ', ''), '_', ''), '-', '')) = 'firekirin'
        AND bot_api_key IS NOT NULL
        AND streamlit_token IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'firekirinagent'`
    ).catch(() => {});
  }
};
