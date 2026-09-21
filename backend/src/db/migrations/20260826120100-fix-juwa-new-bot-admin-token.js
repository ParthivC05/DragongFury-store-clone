'use strict';

const {
  JUWA_NEW_BOT_BASE_URL,
  JUWA_NEW_BOT_ADMIN_TOKEN,
  resolveJuwaNewBotAdminToken
} = require('../../services/games/juwa.config');

/**
 * Backfill Juwa new bot template admin token (X-Admin-Token) from legacy Juwa bot templates or config.
 */
module.exports = {
  async up(queryInterface) {
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

    if (!adminToken && JUWA_NEW_BOT_ADMIN_TOKEN) {
      adminToken = String(JUWA_NEW_BOT_ADMIN_TOKEN).trim();
    }

    await queryInterface.sequelize.query(
      `UPDATE game_templates
       SET bot_base_url = :botBaseUrl,
           is_active = true,
           updated_at = NOW()
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'`,
      { replacements: { botBaseUrl: JUWA_NEW_BOT_BASE_URL } }
    ).catch(() => {});

    if (adminToken) {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET streamlit_token = :adminToken,
             updated_at = NOW()
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'`,
        { replacements: { adminToken } }
      );
    }
  },

  async down() {
    // no-op
  }
};
