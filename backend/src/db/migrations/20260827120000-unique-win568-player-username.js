'use strict';

/**
 * Unique 568Win player username for operator register/login and wallet callbacks.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS win568_players_username_unique
      ON win568_players (LOWER(username))
      WHERE username <> ''
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP INDEX IF EXISTS win568_players_username_unique`);
  }
};
