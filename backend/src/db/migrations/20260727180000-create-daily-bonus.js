'use strict';

/**
 * Daily Bonus (DragonFury): 7-day one-time campaign with SC / bonus spin / discount voucher rewards.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS pending_daily_bonus_spins INTEGER NOT NULL DEFAULT 0
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS user_daily_bonus_campaigns (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        store_code VARCHAR(64) NOT NULL,
        distributor_code VARCHAR(64),
        started_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT user_daily_bonus_campaigns_status_chk
          CHECK (status IN ('active', 'completed', 'expired'))
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_campaigns_user_uidx
      ON user_daily_bonus_campaigns (user_id)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS user_daily_bonus_campaigns_status_idx
      ON user_daily_bonus_campaigns (status, ends_on)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS user_daily_bonus_claims (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES user_daily_bonus_campaigns(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        day_index SMALLINT NOT NULL,
        reward_type VARCHAR(32) NOT NULL,
        reward_payload JSONB,
        claimed_on DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT user_daily_bonus_claims_day_chk CHECK (day_index BETWEEN 1 AND 7),
        CONSTRAINT user_daily_bonus_claims_type_chk
          CHECK (reward_type IN ('sc_coins', 'bonus_spin', 'discount_voucher'))
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_claims_user_day_uidx
      ON user_daily_bonus_claims (user_id, day_index)
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_claims_user_date_uidx
      ON user_daily_bonus_claims (user_id, claimed_on)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS user_daily_bonus_vouchers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        campaign_id INTEGER NOT NULL REFERENCES user_daily_bonus_campaigns(id) ON DELETE CASCADE,
        claim_id INTEGER NOT NULL REFERENCES user_daily_bonus_claims(id) ON DELETE CASCADE,
        percent_off DECIMAL(5, 2) NOT NULL,
        package_scope VARCHAR(16) NOT NULL DEFAULT 'all',
        package_ids JSONB,
        status VARCHAR(16) NOT NULL DEFAULT 'available',
        used_at TIMESTAMPTZ,
        used_on_package_id INTEGER REFERENCES deposit_packages(id) ON DELETE SET NULL,
        deposit_request_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT user_daily_bonus_vouchers_scope_chk
          CHECK (package_scope IN ('all', 'selected')),
        CONSTRAINT user_daily_bonus_vouchers_status_chk
          CHECK (status IN ('available', 'used', 'expired')),
        CONSTRAINT user_daily_bonus_vouchers_percent_chk
          CHECK (percent_off > 0 AND percent_off <= 100)
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS user_daily_bonus_vouchers_user_status_idx
      ON user_daily_bonus_vouchers (user_id, status)
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_vouchers_claim_uidx
      ON user_daily_bonus_vouchers (claim_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`DROP TABLE IF EXISTS user_daily_bonus_vouchers`);
    await q(`DROP TABLE IF EXISTS user_daily_bonus_claims`);
    await q(`DROP TABLE IF EXISTS user_daily_bonus_campaigns`);
    await q(`ALTER TABLE users DROP COLUMN IF EXISTS pending_daily_bonus_spins`);
  }
};
