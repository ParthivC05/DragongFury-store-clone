'use strict';

/** Drop currencies table; currency code (e.g. SC) is stored in settings table. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS currencies CASCADE`,
      { transaction }
    );
  },

  async down() {}
};
