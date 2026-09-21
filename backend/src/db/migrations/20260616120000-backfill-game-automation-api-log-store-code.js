'use strict';

/**
 * Backfill store_code on game_automation_api_logs from the linked game's added_by_store_code.
 * Historical balance/link/password logs were saved without store_code before the logging fix.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE game_automation_api_logs AS l
       SET store_code = g.added_by_store_code
       FROM games AS g
       WHERE l.game_id = g.id
         AND l.store_code IS NULL
         AND g.added_by_store_code IS NOT NULL
         AND TRIM(g.added_by_store_code) <> ''`,
      { transaction }
    );
  },

  async down() {
    // Non-reversible: we cannot distinguish backfilled rows from rows that were correct originally.
  }
};
