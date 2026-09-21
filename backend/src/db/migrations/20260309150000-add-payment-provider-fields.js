'use strict';

/**
 * Add payment provider fields for multi-provider support (e.g. Speed, existing payment API).
 * - payment_pending_deposits: provider, provider_session_id, provider_metadata
 * - deposit_requests: provider, provider_transaction_id
 * - payment_deposit_completions: provider, then UNIQUE(provider, transaction_id)
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE payment_pending_deposits
      ADD COLUMN IF NOT EXISTS provider VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS provider_metadata JSONB NULL
    `);

    await q(`
      ALTER TABLE deposit_requests
      ADD COLUMN IF NOT EXISTS provider VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS provider_transaction_id VARCHAR(128) NULL
    `);

    await q(`
      ALTER TABLE payment_deposit_completions
      ADD COLUMN IF NOT EXISTS provider VARCHAR(64) NULL
    `);
    await q(`UPDATE payment_deposit_completions SET provider = 'centryos' WHERE provider IS NULL OR provider = ''`);
    await q(`ALTER TABLE payment_deposit_completions ALTER COLUMN provider SET DEFAULT 'centryos'`).catch(() => {});
    await q(`ALTER TABLE payment_deposit_completions ALTER COLUMN provider SET NOT NULL`).catch(() => {});

    try {
      await q(`ALTER TABLE payment_deposit_completions DROP CONSTRAINT IF EXISTS payment_deposit_completions_transaction_id_key`);
    } catch (_) {}

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS payment_deposit_completions_provider_transaction_id
      ON payment_deposit_completions(provider, transaction_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction }).catch(() => {});

    await q(`DROP INDEX IF EXISTS payment_deposit_completions_provider_transaction_id`);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS payment_deposit_completions_transaction_id_key
      ON payment_deposit_completions(transaction_id)
    `);

    await queryInterface.removeColumn('payment_deposit_completions', 'provider', { transaction }).catch(() => {});
    await queryInterface.removeColumn('deposit_requests', 'provider', { transaction }).catch(() => {});
    await queryInterface.removeColumn('deposit_requests', 'provider_transaction_id', { transaction }).catch(() => {});
    await queryInterface.removeColumn('payment_pending_deposits', 'provider', { transaction }).catch(() => {});
    await queryInterface.removeColumn('payment_pending_deposits', 'provider_session_id', { transaction }).catch(() => {});
    await queryInterface.removeColumn('payment_pending_deposits', 'provider_metadata', { transaction }).catch(() => {});
  }
};
