'use strict';

const {
  GOLDEN_DRAGON2_BOT_BASE_URL,
  GOLDEN_DRAGON2_ADMIN_TOKEN,
  resolveGoldenDragonAdminToken
} = require('../../services/games/goldenDragon.config');

/**
 * Backfill Golden Dragon 2 template admin token (X-Admin-Token) from legacy template or config.
 */
module.exports = {
  async up(queryInterface) {
    let adminToken = resolveGoldenDragonAdminToken(null);

    if (!adminToken) {
      const [legacy] = await queryInterface.sequelize.query(
        `SELECT streamlit_token FROM game_templates
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', ''))
           IN ('goldendragon', 'goldendragonnewbot')
           AND streamlit_token IS NOT NULL
           AND TRIM(streamlit_token) <> ''
         ORDER BY id ASC
         LIMIT 1`
      );
      if (legacy.length && legacy[0].streamlit_token) {
        adminToken = String(legacy[0].streamlit_token).trim();
      }
    }

    if (!adminToken && GOLDEN_DRAGON2_ADMIN_TOKEN) {
      adminToken = String(GOLDEN_DRAGON2_ADMIN_TOKEN).trim();
    }

    await queryInterface.sequelize.query(
      `UPDATE game_templates
       SET bot_base_url = :botBaseUrl,
           is_active = true,
           updated_at = NOW()
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'goldendragon2'`,
      { replacements: { botBaseUrl: GOLDEN_DRAGON2_BOT_BASE_URL } }
    ).catch(() => {});

    if (adminToken) {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET streamlit_token = :adminToken,
             updated_at = NOW()
         WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'goldendragon2'`,
        { replacements: { adminToken } }
      );
    }
  },

  async down() {
    // no-op
  }
};
