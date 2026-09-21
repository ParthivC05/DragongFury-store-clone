'use strict';

/**
 * Golden Dragon 2 bot — see goldendragon_API.md.
 * URL + admin token live here and in game_templates (via migration / master admin).
 *
 * Admin token = X-Admin-Token = STREAMLIT_ADMIN_PASSWORD on the bot server (:8018).
 * Master admin can also set game_templates.streamlit_token for the Golden Dragon template.
 */
const GOLDEN_DRAGON2_BOT_BASE_URL = 'http://18.213.73.32:8018';

/** Fallback when template.streamlit_token is empty. Set to match the bot server's STREAMLIT_ADMIN_PASSWORD. */
const GOLDEN_DRAGON2_ADMIN_TOKEN = '';

function resolveGoldenDragonAdminToken(templateToken) {
  const fromTemplate = templateToken != null ? String(templateToken).trim() : '';
  if (fromTemplate) return fromTemplate;
  const fromConfig = String(GOLDEN_DRAGON2_ADMIN_TOKEN || '').trim();
  return fromConfig || null;
}

module.exports = {
  GOLDEN_DRAGON2_BOT_BASE_URL,
  GOLDEN_DRAGON2_ADMIN_TOKEN,
  GOLDEN_DRAGON_GAME_KEY: 'goldendragon2',
  resolveGoldenDragonAdminToken
};
