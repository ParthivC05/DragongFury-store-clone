'use strict';

const { GOLDEN_DRAGON2_BOT_BASE_URL, GOLDEN_DRAGON_GAME_KEY } = require('../../services/games/goldenDragon.config');

/**
 * Golden Dragon 2 bot (port 8018) — see goldendragon_API.md.
 * Existing store games must re-add the POS agent on the new bot and regenerate API keys.
 */
module.exports = {
  async up(queryInterface) {
    const botBaseUrl = GOLDEN_DRAGON2_BOT_BASE_URL;

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'goldendragon2'
       LIMIT 1`
    );

    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Golden Dragon',
        game_key: GOLDEN_DRAGON_GAME_KEY,
        streamlit_token: null,
        bot_base_url: botBaseUrl,
        game_link: 'https://www.playgd.mobi/SSLobby/m4488.0/web-mobile/index.html',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    } else {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET bot_base_url = :botBaseUrl,
             is_active = true,
             updated_at = NOW()
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'goldendragon2'`,
        { replacements: { botBaseUrl } }
      );
    }

    await queryInterface.sequelize.query(
      `UPDATE game_templates
       SET is_active = false, updated_at = NOW()
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', ''))
         IN ('goldendragon', 'goldendragonnewbot')
         AND LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) <> 'goldendragon2'`
    ).catch(() => {});

    await queryInterface.sequelize.query(
      `UPDATE games
       SET bot_api_url = :botBaseUrl,
           game_key = :gameKey,
           bot_offline = false,
           updated_at = NOW()
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', ''))
         IN ('goldendragon', 'goldendragonnewbot', 'goldendragon2')
         OR LOWER(TRIM(name)) IN ('golden dragon', 'goldendragon')`,
      { replacements: { botBaseUrl, gameKey: GOLDEN_DRAGON_GAME_KEY } }
    ).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'goldendragon2'`
    ).catch(() => {});
    await queryInterface.sequelize.query(
      `UPDATE game_templates
       SET is_active = true, updated_at = NOW()
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', ''))
         IN ('goldendragon', 'goldendragonnewbot')`
    ).catch(() => {});
  }
};
