'use strict';

/** Remove unused 1GameHub session and transaction tables. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS one_game_hub_transactions CASCADE`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS one_game_hub_sessions CASCADE`,
      { transaction }
    );
  },

  async down() {}
};
