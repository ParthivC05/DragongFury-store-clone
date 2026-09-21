'use strict';

/**
 * One game username per platform user per store game (game_id).
 * Prevents two users on the same store from linking/registering the same bot_username.
 *
 * Index name must match UNIQUE_GAME_USERNAME_INDEX in assertGameUsernameAvailable.service.js.
 *
 * If legacy duplicate rows exist, the index is skipped so deploy does not fail.
 * App-level checks in assertGameUsernameAvailable.service.js still block new conflicts.
 */
const TABLE = 'user_game_accounts';
const INDEX_NAME = 'user_game_accounts_game_id_bot_username_lower_uidx';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction, replacements });

    const [duplicateRows] = await q(`
      SELECT game_id, LOWER(TRIM(bot_username)) AS normalized_username, COUNT(DISTINCT user_id)::int AS user_count
      FROM ${TABLE}
      WHERE bot_username IS NOT NULL AND TRIM(bot_username) <> ''
      GROUP BY game_id, LOWER(TRIM(bot_username))
      HAVING COUNT(DISTINCT user_id) > 1
      LIMIT 5
    `);

    const [countRows] = await q(`
      SELECT COUNT(*)::int AS duplicate_groups
      FROM (
        SELECT game_id, LOWER(TRIM(bot_username)) AS normalized_username
        FROM ${TABLE}
        WHERE bot_username IS NOT NULL AND TRIM(bot_username) <> ''
        GROUP BY game_id, LOWER(TRIM(bot_username))
        HAVING COUNT(DISTINCT user_id) > 1
      ) duplicates
    `);

    const duplicateGroups = Number(countRows[0]?.duplicate_groups ?? 0);

    if (duplicateGroups > 0) {
      console.warn(
        `[migration] Skipping ${INDEX_NAME}: found ${duplicateGroups} duplicate game username group(s) ` +
        'across different platform users. App validation will block new conflicts. ' +
        'Resolve legacy duplicates, then create the index manually or add a follow-up migration.'
      );
      if (duplicateRows.length > 0) {
        console.warn('[migration] Sample duplicate groups (up to 5):', duplicateRows);
      }
      return;
    }

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
      ON ${TABLE} (game_id, LOWER(TRIM(bot_username)))
      WHERE bot_username IS NOT NULL AND TRIM(bot_username) <> ''
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS ${INDEX_NAME}`,
      { transaction }
    );
  }
};
