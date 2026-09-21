'use strict';

const { JUWA_NEW_BOT_BASE_URL, JUWA_NEW_BOT_GAME_KEY, resolveJuwaNewBotAdminToken } = require('../../services/games/juwa.config');

/**
 * Repair: seed migration was recorded but juwanewbot row may be missing from game_templates.
 */
module.exports = {
  async up(queryInterface) {
    const botBaseUrl = JUWA_NEW_BOT_BASE_URL;
    const compactKey = 'juwanewbot';

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = :compactKey
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(name, ''), ' ', ''), '_', ''), '-', '')) = :compactKey
       LIMIT 1`,
      { replacements: { compactKey } }
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
             game_key = :gameKey,
             bot_base_url = :botBaseUrl,
             game_link = COALESCE(NULLIF(TRIM(game_link), ''), 'https://dl.juwa777.com/'),
             is_active = true,
             updated_at = NOW()
         WHERE id = :id`,
        { replacements: { gameKey: JUWA_NEW_BOT_GAME_KEY, botBaseUrl, id: existing[0].id } }
      );
    }

    const [row] = await queryInterface.sequelize.query(
      `SELECT id, streamlit_token FROM game_templates
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = :compactKey
       LIMIT 1`,
      { replacements: { compactKey } }
    );
    const templateId = row[0]?.id;
    const hasToken = row[0]?.streamlit_token && String(row[0].streamlit_token).trim();
    if (!templateId || hasToken) return;

    let adminToken = resolveJuwaNewBotAdminToken(null);
    if (!adminToken) {
      const [legacy] = await queryInterface.sequelize.query(
        `SELECT streamlit_token FROM game_templates
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', ''))
           IN ('juwa', 'juwabot', 'juwaautomation', 'juwalegacy')
           AND streamlit_token IS NOT NULL
           AND TRIM(streamlit_token) <> ''
         ORDER BY id ASC
         LIMIT 1`
      );
      if (legacy.length && legacy[0].streamlit_token) {
        adminToken = String(legacy[0].streamlit_token).trim();
      }
    }
    if (adminToken) {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET streamlit_token = :adminToken,
             updated_at = NOW()
         WHERE id = :id`,
        { replacements: { adminToken, id: templateId } }
      );
    }
  },

  async down() {
    // no-op repair migration
  }
};
