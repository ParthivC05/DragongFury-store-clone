'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE chime_deposit_requests
       ADD COLUMN IF NOT EXISTS metadata JSONB`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE chime_deposit_requests
       DROP COLUMN IF EXISTS metadata`,
      { transaction }
    );
  }
};
