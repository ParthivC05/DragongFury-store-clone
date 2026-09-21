'use strict';

/**
 * One pending manual redeem request per user per game.
 * Prevents a user from submitting a second redeem request for the same game
 * while an earlier redeem request is still pending (race-proof at the DB level;
 * the app-level guard lives in redeem.service.js -> assertNoPendingRedeemRequest).
 *
 * If legacy duplicate pending rows exist, the index is skipped so deploy does not fail.
 * App-level checks still block new conflicts.
 */
const TABLE = 'game_manual_requests';
const INDEX_NAME = 'game_manual_requests_pending_redeem_uidx';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    const [countRows] = await q(`
      SELECT COUNT(*)::int AS duplicate_groups
      FROM (
        SELECT user_id, game_id
        FROM ${TABLE}
        WHERE request_type = 'redeem' AND status = 'pending'
        GROUP BY user_id, game_id
        HAVING COUNT(*) > 1
      ) duplicates
    `);

    const duplicateGroups = Number(countRows[0]?.duplicate_groups ?? 0);

    if (duplicateGroups > 0) {
      console.warn(
        `[migration] Skipping ${INDEX_NAME}: found ${duplicateGroups} duplicate pending redeem ` +
        'request group(s) for the same user+game. App validation will block new conflicts. ' +
        'Resolve legacy duplicates, then create the index manually or add a follow-up migration.'
      );
      return;
    }

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
      ON ${TABLE} (user_id, game_id)
      WHERE request_type = 'redeem' AND status = 'pending'
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
