'use strict';

/**
 * Backfill deposit_courtesy rows in user_transactions for auto-expired manual deposits
 * that granted +1 SC courtesy (logged via rejection reason marker, or legacy auto-refunds
 * before the 24h courtesy cap shipped).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const migrationStartedAt = new Date().toISOString();

    await sequelize.query(
      `INSERT INTO user_transactions (user_id, type, amount, currency_code, description, metadata, created_at, updated_at)
       SELECT
         gmr.user_id,
         'deposit_courtesy',
         1.00,
         'SC',
         'Manual deposit expiry courtesy: 1 SC',
         json_build_object(
           'manual_request_id', gmr.id,
           'game_id', gmr.game_id,
           'game_name', g.name,
           'deposit_amount_refunded', gmr.amount,
           'backfilled', true
         ),
         COALESCE(gmr.resolved_at, gmr.updated_at, gmr.created_at),
         COALESCE(gmr.resolved_at, gmr.updated_at, gmr.created_at)
       FROM game_manual_requests gmr
       LEFT JOIN games g ON g.id = gmr.game_id
       WHERE gmr.request_type = 'deposit'
         AND gmr.status = 'rejected'
         AND gmr.operation_done_by = 'system'
         AND gmr.rejection_reason LIKE 'Auto-refund:%'
         AND (
           gmr.rejection_reason LIKE '%Courtesy: 1 SC%'
           OR (
             gmr.rejection_reason NOT LIKE '%Courtesy: 1 SC%'
             AND gmr.resolved_at IS NOT NULL
             AND gmr.resolved_at < :migrationStartedAt
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_transactions ut
           WHERE ut.type = 'deposit_courtesy'
             AND (ut.metadata->>'manual_request_id') = gmr.id::text
         )`,
      { transaction, replacements: { migrationStartedAt } }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `DELETE FROM user_transactions
       WHERE type = 'deposit_courtesy'
         AND (metadata->>'backfilled')::boolean IS TRUE`,
      { transaction }
    );
  }
};
