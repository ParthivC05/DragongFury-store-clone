'use strict';

/**
 * KYC fields for Didit (one-time verification required before withdraw).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(32) NOT NULL DEFAULT 'not_started',
      ADD COLUMN IF NOT EXISTS kyc_provider VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS didit_session_id VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS didit_workflow_id VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS kyc_updated_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS kyc_decline_reason TEXT NULL
    `);

    await q(`CREATE INDEX IF NOT EXISTS users_kyc_status_idx ON users (kyc_status)`);
    await q(`CREATE INDEX IF NOT EXISTS users_didit_session_id_idx ON users (didit_session_id)`);

    await q(`
      INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at)
      SELECT 'didit_kyc', NULL, NULL, '{"enabled":true}', NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM settings
        WHERE key = 'didit_kyc' AND distributor_code IS NULL AND store_code IS NULL
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP INDEX IF EXISTS users_didit_session_id_idx`);
    await q(`DROP INDEX IF EXISTS users_kyc_status_idx`);
    await q(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS kyc_status,
      DROP COLUMN IF EXISTS kyc_provider,
      DROP COLUMN IF EXISTS didit_session_id,
      DROP COLUMN IF EXISTS didit_workflow_id,
      DROP COLUMN IF EXISTS kyc_verified_at,
      DROP COLUMN IF EXISTS kyc_updated_at,
      DROP COLUMN IF EXISTS kyc_decline_reason
    `);
    await q(`DELETE FROM settings WHERE key = 'didit_kyc' AND distributor_code IS NULL AND store_code IS NULL`);
  }
};
