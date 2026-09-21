'use strict';

/**
 * Idempotent: add Give 15 / Get 15 tracking columns on referral_deposit_rewards.
 * Existing rows are treated as already paid (classic program).
 */
const TABLE = 'referral_deposit_rewards';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${TABLE}
        ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'paid',
        ADD COLUMN IF NOT EXISTS payout_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS playthrough_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS skip_reason VARCHAR(64) NULL
    `);

    await q(`
      UPDATE ${TABLE}
      SET credited_at = COALESCE(credited_at, created_at),
          status = COALESCE(NULLIF(status, ''), 'paid')
      WHERE credited_at IS NULL OR status IS NULL OR status = ''
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS referral_deposit_rewards_status_payout
      ON ${TABLE}(status, payout_at)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS referral_deposit_rewards_deposit_request
      ON ${TABLE}(deposit_request_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP INDEX IF EXISTS referral_deposit_rewards_status_payout`);
    await q(`DROP INDEX IF EXISTS referral_deposit_rewards_deposit_request`);
    await q(`
      ALTER TABLE ${TABLE}
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS payout_at,
        DROP COLUMN IF EXISTS playthrough_at,
        DROP COLUMN IF EXISTS credited_at,
        DROP COLUMN IF EXISTS skip_reason
    `);
  }
};
