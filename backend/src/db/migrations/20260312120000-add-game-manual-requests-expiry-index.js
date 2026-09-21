'use strict';

/**
 * Composite index for the expiry job: find pending deposit requests older than 3 hours.
 * With 50+ stores and 500+ users per store, this keeps the expiry query fast.
 * Uses IF NOT EXISTS so migration is idempotent if index was already created.
 */
module.exports = {
  async up(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS game_manual_requests_expiry_idx ON game_manual_requests (request_type, status, created_at)',
      { transaction }
    );
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS game_manual_requests_expiry_idx',
      { transaction }
    );
  }
};
