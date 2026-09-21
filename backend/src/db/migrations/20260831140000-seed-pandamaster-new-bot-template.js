'use strict';

const {
  PANDAMASTER_NEW_BOT_BASE_URL,
  PANDAMASTER_NEW_BOT_GAME_KEY
} = require('../../services/games/pandamaster.config');

/**
 * Pandamaster 2.0 bot (port 8024) — see Pandamaster_API.md.
 * Same integration as legacy Pandamaster bot; template name "Pandamaster new bot".
 */
module.exports = {
  async up(queryInterface) {
    const botBaseUrl = PANDAMASTER_NEW_BOT_BASE_URL;

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'pandamaster2'
       LIMIT 1`
    );

    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Pandamaster new bot',
        game_key: PANDAMASTER_NEW_BOT_GAME_KEY,
        streamlit_token: null,
        bot_base_url: botBaseUrl,
        game_link: 'https://pandamaster.vip:8888/index.html',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    } else {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET name = 'Pandamaster new bot',
             game_key = :gameKey,
             bot_base_url = :botBaseUrl,
             game_link = COALESCE(NULLIF(TRIM(game_link), ''), 'https://pandamaster.vip:8888/index.html'),
             is_active = true,
             updated_at = NOW()
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'pandamaster2'`,
        { replacements: { gameKey: PANDAMASTER_NEW_BOT_GAME_KEY, botBaseUrl } }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'pandamaster2'`
    ).catch(() => {});
  }
};
