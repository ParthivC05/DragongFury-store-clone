'use strict';

/**
 * Speeds up Orionstars Pay expire cron:
 * WHERE provider = 'orionstarspay' AND status IN (...) AND created_at < cutoff
 * ORDER BY created_at DESC
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS deposit_orders_provider_status_created_idx
      ON deposit_orders (provider, status, created_at DESC)
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS payment_pending_deposits_provider_status_created_idx
      ON payment_pending_deposits (provider, status, created_at DESC)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS deposit_orders_provider_status_created_idx
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS payment_pending_deposits_provider_status_created_idx
    `);
  }
};
