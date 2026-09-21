'use strict';

const { QueryTypes } = require('sequelize');

function compactKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isJuwaFamilyRow(row) {
  const key = compactKey(row.game_key);
  const name = compactKey(row.name);
  if (key.includes('juwa20') || name.includes('juwa20')) return false;
  return key.includes('juwa') || name.includes('juwa');
}

/**
 * Stores that added "Juwa new bot" as a second game: merge onto the original Juwa row
 * so player accounts stay on one game_id. Applies new-bot config when the duplicate was juwanewbot.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const games = await sequelize.query(
      `SELECT id, name, game_key, added_by_store_code, bot_api_url, bot_api_key,
              streamlit_token, game_template_id, is_active
       FROM games
       WHERE is_active = true`,
      { type: QueryTypes.SELECT }
    );

    const byStore = new Map();
    for (const row of games) {
      if (!isJuwaFamilyRow(row)) continue;
      const storeCode = row.added_by_store_code || '';
      if (!byStore.has(storeCode)) byStore.set(storeCode, []);
      byStore.get(storeCode).push(row);
    }

    for (const rows of byStore.values()) {
      if (rows.length <= 1) continue;

      const canonical = rows.find((r) => compactKey(r.game_key) !== 'juwanewbot')
        || rows.slice().sort((a, b) => a.id - b.id)[0];
      const duplicates = rows.filter((r) => r.id !== canonical.id);

      for (const dup of duplicates) {
        await sequelize.query(
          `UPDATE user_game_accounts uga
           SET game_id = :canonicalId, updated_at = NOW()
           WHERE uga.game_id = :dupId
             AND NOT EXISTS (
               SELECT 1 FROM user_game_accounts x
               WHERE x.user_id = uga.user_id AND x.game_id = :canonicalId
             )`,
          { replacements: { canonicalId: canonical.id, dupId: dup.id } }
        );

        if (compactKey(dup.game_key) === 'juwanewbot') {
          await sequelize.query(
            `UPDATE games
             SET name = 'Juwa',
                 game_key = :gameKey,
                 bot_api_url = :botApiUrl,
                 bot_api_key = :botApiKey,
                 streamlit_token = :streamlitToken,
                 game_template_id = :gameTemplateId,
                 updated_at = NOW()
             WHERE id = :canonicalId`,
            {
              replacements: {
                canonicalId: canonical.id,
                gameKey: dup.game_key || 'juwanewbot',
                botApiUrl: dup.bot_api_url,
                botApiKey: dup.bot_api_key,
                streamlitToken: dup.streamlit_token,
                gameTemplateId: dup.game_template_id
              }
            }
          );
        }

        await sequelize.query(
          `UPDATE games SET is_active = false, updated_at = NOW() WHERE id = :dupId`,
          { replacements: { dupId: dup.id } }
        );
      }
    }
  },

  async down() {
    // Non-destructive merge — cannot safely undo account moves.
  }
};
