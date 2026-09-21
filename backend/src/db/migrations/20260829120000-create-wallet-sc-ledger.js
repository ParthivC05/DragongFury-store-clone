'use strict';

/**
 * Wallet SC reconciliation ledger.
 * Every PSC / Bonus / RSC change gets a row so Opening + Added − Used = Closing.
 */

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`
      CREATE TABLE IF NOT EXISTS wallet_sc_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        store_code VARCHAR(64),
        wallet_type VARCHAR(16) NOT NULL,
        direction VARCHAR(8) NOT NULL,
        amount NUMERIC(18, 2) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        source_type VARCHAR(64),
        source_id VARCHAR(128),
        product_id VARCHAR(32),
        product_type VARCHAR(16),
        provider_id VARCHAR(64),
        game_id INTEGER,
        round_id VARCHAR(128),
        bonus_type VARCHAR(64),
        bonus_lot_id BIGINT,
        payment_id VARCHAR(128),
        processor_id VARCHAR(64),
        package_id INTEGER,
        parent_transaction_id BIGINT,
        idempotency_key VARCHAR(255) NOT NULL,
        created_by INTEGER,
        remarks TEXT,
        metadata JSONB,
        balance_before NUMERIC(18, 2),
        balance_after NUMERIC(18, 2),
        is_bonus_origin BOOLEAN NOT NULL DEFAULT FALSE,
        gross_amount NUMERIC(18, 2),
        eligible_amount NUMERIC(18, 2),
        voided_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE UNIQUE INDEX IF NOT EXISTS wallet_sc_ledger_idempotency_uidx ON wallet_sc_ledger (idempotency_key)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_ledger_user_created_idx ON wallet_sc_ledger (user_id, created_at)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_ledger_store_created_idx ON wallet_sc_ledger (store_code, created_at)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_ledger_wallet_event_idx ON wallet_sc_ledger (wallet_type, event_type, created_at)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_ledger_product_idx ON wallet_sc_ledger (product_id, created_at)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_ledger_payment_idx ON wallet_sc_ledger (payment_id)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_ledger_parent_idx ON wallet_sc_ledger (parent_transaction_id)`);

    await q(`
      CREATE TABLE IF NOT EXISTS bonus_sc_lots (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        store_code VARCHAR(64),
        bonus_type VARCHAR(64) NOT NULL,
        original_amount NUMERIC(18, 2) NOT NULL,
        remaining_amount NUMERIC(18, 2) NOT NULL,
        max_cashout NUMERIC(18, 2),
        requires_deposit BOOLEAN NOT NULL DEFAULT FALSE,
        excess_win_action VARCHAR(16) NOT NULL DEFAULT 'void',
        rsc_generated_gross NUMERIC(18, 2) NOT NULL DEFAULT 0,
        rsc_generated_eligible NUMERIC(18, 2) NOT NULL DEFAULT 0,
        rsc_voided_cap NUMERIC(18, 2) NOT NULL DEFAULT 0,
        outstanding_play NUMERIC(18, 2) NOT NULL DEFAULT 0,
        source_type VARCHAR(64),
        source_id VARCHAR(128),
        payment_id VARCHAR(128),
        package_id INTEGER,
        ledger_id BIGINT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS bonus_sc_lots_user_fifo_idx ON bonus_sc_lots (user_id, created_at) WHERE remaining_amount > 0`);
    await q(`CREATE INDEX IF NOT EXISTS bonus_sc_lots_user_type_idx ON bonus_sc_lots (user_id, bonus_type)`);

    await q(`
      CREATE TABLE IF NOT EXISTS bonus_sc_lot_consumptions (
        id BIGSERIAL PRIMARY KEY,
        lot_id BIGINT NOT NULL REFERENCES bonus_sc_lots(id) ON DELETE CASCADE,
        ledger_id BIGINT NOT NULL REFERENCES wallet_sc_ledger(id) ON DELETE CASCADE,
        amount NUMERIC(18, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS bonus_sc_lot_consumptions_lot_idx ON bonus_sc_lot_consumptions (lot_id)`);
    await q(`CREATE INDEX IF NOT EXISTS bonus_sc_lot_consumptions_ledger_idx ON bonus_sc_lot_consumptions (ledger_id)`);

    await q(`
      CREATE TABLE IF NOT EXISTS wallet_sc_daily_tallies (
        id BIGSERIAL PRIMARY KEY,
        tally_date DATE NOT NULL,
        store_code VARCHAR(64),
        user_id INTEGER,
        payload JSONB NOT NULL,
        difference_psc NUMERIC(18, 2) NOT NULL DEFAULT 0,
        difference_bonus NUMERIC(18, 2) NOT NULL DEFAULT 0,
        difference_rsc NUMERIC(18, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS wallet_sc_daily_tallies_date_idx ON wallet_sc_daily_tallies (tally_date)`);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS wallet_sc_daily_tallies_scope_uidx
      ON wallet_sc_daily_tallies (tally_date, COALESCE(store_code, ''), COALESCE(user_id, 0))
    `);

    // Starting balances so Opening + later moves = current wallet from this day forward.
    await q(`
      INSERT INTO wallet_sc_ledger (
        user_id, store_code, wallet_type, direction, amount, event_type,
        source_type, source_id, idempotency_key, remarks,
        balance_before, balance_after, created_at
      )
      SELECT
        w.user_id,
        u.store_code,
        CASE UPPER(TRIM(w.currency_code))
          WHEN 'BSC' THEN 'BONUS'
          WHEN 'RSC' THEN 'RSC'
          ELSE 'PSC'
        END,
        'CREDIT',
        ROUND(w.balance::numeric, 2),
        'OPENING_SNAPSHOT',
        'MIGRATION',
        w.id::text,
        'opening-snapshot:' || w.user_id::text || ':' || UPPER(TRIM(w.currency_code)),
        'Starting SC when tracking began',
        0,
        ROUND(w.balance::numeric, 2),
        TIMESTAMPTZ '2020-01-01 00:00:00+00'
      FROM wallets w
      JOIN users u ON u.user_id = w.user_id
      WHERE w.balance > 0
        AND UPPER(TRIM(w.currency_code)) IN ('PSC', 'BSC', 'RSC', 'SC')
      ON CONFLICT (idempotency_key) DO NOTHING
    `);

    await q(`
      INSERT INTO bonus_sc_lots (
        user_id, store_code, bonus_type, original_amount, remaining_amount,
        source_type, source_id, created_at, updated_at
      )
      SELECT
        w.user_id,
        u.store_code,
        'LEGACY_BALANCE',
        ROUND(w.balance::numeric, 2),
        ROUND(w.balance::numeric, 2),
        'MIGRATION',
        w.id::text,
        TIMESTAMPTZ '2020-01-01 00:00:00+00',
        TIMESTAMPTZ '2020-01-01 00:00:00+00'
      FROM wallets w
      JOIN users u ON u.user_id = w.user_id
      WHERE UPPER(TRIM(w.currency_code)) = 'BSC'
        AND w.balance > 0
    `);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP TABLE IF EXISTS wallet_sc_daily_tallies`);
    await q(`DROP TABLE IF EXISTS bonus_sc_lot_consumptions`);
    await q(`DROP TABLE IF EXISTS bonus_sc_lots`);
    await q(`DROP TABLE IF EXISTS wallet_sc_ledger`);
  }
};
