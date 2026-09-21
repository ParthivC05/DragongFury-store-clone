'use strict';

/**
 * Juwa 4.0 bot — see juwa_API.md (port 8023).
 * Same player/admin endpoints as the legacy Juwa streamlit bot.
 *
 * Admin token = X-Admin-Token = STREAMLIT_ADMIN_PASSWORD on the bot server (:8023).
 */
const JUWA_NEW_BOT_BASE_URL = 'http://18.213.73.32:8023';

/** Fallback when template.streamlit_token is empty. Set to match the bot server's STREAMLIT_ADMIN_PASSWORD. */
const JUWA_NEW_BOT_ADMIN_TOKEN = '';

function resolveJuwaNewBotAdminToken(templateToken) {
  const fromTemplate = templateToken != null ? String(templateToken).trim() : '';
  if (fromTemplate) return fromTemplate;
  const fromConfig = String(JUWA_NEW_BOT_ADMIN_TOKEN || '').trim();
  return fromConfig || null;
}

module.exports = {
  JUWA_NEW_BOT_BASE_URL,
  JUWA_NEW_BOT_ADMIN_TOKEN,
  JUWA_NEW_BOT_GAME_KEY: 'juwanewbot',
  resolveJuwaNewBotAdminToken
};
