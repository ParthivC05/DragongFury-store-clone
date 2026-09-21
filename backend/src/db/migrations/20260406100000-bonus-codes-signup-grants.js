'use strict';

/**
 * Store-scoped deposit bonus codes (signup via URL), grants per deposit, user.signup_bonus_code_id.
 */
const BONUS_CODES = 'bonus_codes';
const GRANTS = 'user_bonus_code_grants';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${BONUS_CODES} (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        store_code VARCHAR(64) NOT NULL,
        distributor_code VARCHAR(64) NULL,
        bonus_type VARCHAR(32) NOT NULL DEFAULT 'deposit',
        claim_scope VARCHAR(32) NOT NULL,
        max_claims_per_user INTEGER NULL,
        value_type VARCHAR(16) NOT NULL,
        value NUMERIC(12, 4) NOT NULL,
        max_bonus_cap NUMERIC(18, 2) NULL,
        min_deposit NUMERIC(18, 2) NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by_user_id INTEGER NULL REFERENCES users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT bonus_codes_claim_scope_chk CHECK (claim_scope IN ('every_deposit', 'fixed_count')),
        CONSTRAINT bonus_codes_value_type_chk CHECK (value_type IN ('fixed', 'percentage')),
        CONSTRAINT bonus_codes_fixed_claims_chk CHECK (
          (claim_scope = 'fixed_count' AND max_claims_per_user IS NOT NULL AND max_claims_per_user >= 1)
          OR (claim_scope = 'every_deposit' AND max_claims_per_user IS NULL)
        )
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS bonus_codes_store_code_lower_code_uidx
      ON ${BONUS_CODES} (store_code, LOWER(code))
    `);

    await q(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS signup_bonus_code_id INTEGER NULL
      REFERENCES ${BONUS_CODES}(id) ON DELETE SET NULL
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${GRANTS} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        bonus_code_id INTEGER NOT NULL REFERENCES ${BONUS_CODES}(id) ON DELETE CASCADE,
        deposit_request_id INTEGER NOT NULL REFERENCES deposit_requests(id) ON DELETE CASCADE,
        amount NUMERIC(18, 2) NOT NULL,
        currency_code VARCHAR(10) NOT NULL DEFAULT 'SC',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT user_bonus_grants_deposit_code_uidx UNIQUE (deposit_request_id, bonus_code_id)
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS user_bonus_grants_user_id_idx ON ${GRANTS} (user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS user_bonus_grants_bonus_code_id_idx ON ${GRANTS} (bonus_code_id)`);
    await q(`CREATE INDEX IF NOT EXISTS users_signup_bonus_code_id_idx ON users (signup_bonus_code_id)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS ${GRANTS}`);
    await q(`ALTER TABLE users DROP COLUMN IF EXISTS signup_bonus_code_id`);
    await q(`DROP TABLE IF EXISTS ${BONUS_CODES}`);
  }
};
