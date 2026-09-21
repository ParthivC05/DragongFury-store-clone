'use strict';

/**
 * Pandamaster 2.0 bot — see Pandamaster_API.md (port 8024).
 * Same player/admin endpoints as the legacy Pandamaster bot on port 8017.
 *
 * Admin token = X-Admin-Token = STREAMLIT_ADMIN_PASSWORD on the bot server (:8024).
 */
const PANDAMASTER_NEW_BOT_BASE_URL = 'http://18.213.73.32:8024';

/** Fallback when template.streamlit_token is empty. Set to match the bot server's STREAMLIT_ADMIN_PASSWORD. */
const PANDAMASTER_NEW_BOT_ADMIN_TOKEN = '';

function resolvePandamasterNewBotAdminToken(templateToken) {
  const fromTemplate = templateToken != null ? String(templateToken).trim() : '';
  if (fromTemplate) return fromTemplate;
  const fromConfig = String(PANDAMASTER_NEW_BOT_ADMIN_TOKEN || '').trim();
  return fromConfig || null;
}

module.exports = {
  PANDAMASTER_NEW_BOT_BASE_URL,
  PANDAMASTER_NEW_BOT_ADMIN_TOKEN,
  PANDAMASTER_NEW_BOT_GAME_KEY: 'pandamaster2',
  resolvePandamasterNewBotAdminToken
};
