'use strict';

const { JUWA_NEW_BOT_BASE_URL, JUWA_NEW_BOT_GAME_KEY } = require('../../services/games/juwa.config');

/**
 * Juwa 4.0 bot (port 8023) — see juwa_API.md.
 * Same integration as legacy Juwa bot; template name "Juwa new bot".
 */
module.exports = {
  async up(queryInterface) {
    const botBaseUrl = JUWA_NEW_BOT_BASE_URL;

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'
       LIMIT 1`
    );

    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Juwa new bot',
        game_key: JUWA_NEW_BOT_GAME_KEY,
        streamlit_token: null,
        bot_base_url: botBaseUrl,
        game_link: 'https://dl.juwa777.com/',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    } else {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET name = 'Juwa new bot',
             bot_base_url = :botBaseUrl,
             game_link = COALESCE(NULLIF(TRIM(game_link), ''), 'https://dl.juwa777.com/'),
             is_active = true,
             updated_at = NOW()
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'`,
        { replacements: { botBaseUrl } }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'`
    ).catch(() => {});
  }
};
