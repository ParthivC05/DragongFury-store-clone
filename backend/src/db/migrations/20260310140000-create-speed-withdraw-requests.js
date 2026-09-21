'use strict';

/**
 * Table for Speed LNURL withdraw-request flow (in-app QR + timer).
 * One row per Speed withdraw-request; status updated via webhook or polling.
 */
const TABLE = 'speed_withdraw_requests';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        provider VARCHAR(32) NOT NULL DEFAULT 'speed',
        provider_reference VARCHAR(128) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'withdraw',
        amount DECIMAL(18, 8) NOT NULL,
        currency VARCHAR(16) NOT NULL,
        target_currency VARCHAR(16),
        exchange_rate DECIMAL(18, 8),
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        withdraw_request TEXT NOT NULL,
        ttl INTEGER,
        expires_at TIMESTAMPTZ,
        provider_payload_raw JSONB,
        claimed_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        deactivated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS speed_withdraw_requests_user_id ON ${TABLE}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS speed_withdraw_requests_provider_reference ON ${TABLE}(provider_reference)`);
    await q(`CREATE INDEX IF NOT EXISTS speed_withdraw_requests_status ON ${TABLE}(status)`);
    await q(`CREATE INDEX IF NOT EXISTS speed_withdraw_requests_created_at ON ${TABLE}(created_at)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
