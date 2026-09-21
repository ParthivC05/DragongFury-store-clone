'use strict';

const DEPOSIT_ORDERS_TABLE = 'deposit_orders';
const PROVIDER_EVENTS_TABLE = 'provider_transaction_events';
const WALLET_LEDGER_TABLE = 'wallet_ledger';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${DEPOSIT_ORDERS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        provider VARCHAR(64) NOT NULL DEFAULT 'orionstarspay',
        requested_amount DECIMAL(18,2) NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        status VARCHAR(32) NOT NULL DEFAULT 'LINK_CREATED',
        payment_link_url TEXT,
        payment_link_token VARCHAR(255),
        provider_application_id VARCHAR(255),
        provider_transaction_id VARCHAR(128),
        link_expires_at TIMESTAMPTZ,
        last_synced_at TIMESTAMPTZ,
        sync_attempt_count INTEGER NOT NULL DEFAULT 0,
        last_sync_error TEXT,
        completed_at TIMESTAMPTZ,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${PROVIDER_EVENTS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        provider VARCHAR(64) NOT NULL DEFAULT 'orionstarspay',
        provider_transaction_id VARCHAR(128) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        payment_link_token VARCHAR(255),
        event_type VARCHAR(64),
        provider_status VARCHAR(64),
        amount DECIMAL(18,2),
        currency VARCHAR(8),
        method VARCHAR(64),
        raw_payload JSONB,
        seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${WALLET_LEDGER_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        entry_type VARCHAR(16) NOT NULL,
        asset_type VARCHAR(16) NOT NULL DEFAULT 'SC',
        amount DECIMAL(18,2) NOT NULL,
        balance_before DECIMAL(18,2),
        balance_after DECIMAL(18,2),
        reason VARCHAR(64) NOT NULL,
        reference_type VARCHAR(64) NOT NULL,
        reference_id VARCHAR(128) NOT NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS deposit_orders_user_status_created_idx ON ${DEPOSIT_ORDERS_TABLE}(user_id, status, created_at DESC)`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS deposit_orders_payment_link_token_uidx ON ${DEPOSIT_ORDERS_TABLE}(payment_link_token) WHERE payment_link_token IS NOT NULL`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS deposit_orders_provider_transaction_id_uidx ON ${DEPOSIT_ORDERS_TABLE}(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL`);
    await q(`CREATE INDEX IF NOT EXISTS deposit_orders_provider_application_idx ON ${DEPOSIT_ORDERS_TABLE}(provider_application_id)`);

    await q(`CREATE UNIQUE INDEX IF NOT EXISTS provider_transaction_events_transaction_uidx ON ${PROVIDER_EVENTS_TABLE}(provider_transaction_id)`);
    await q(`CREATE INDEX IF NOT EXISTS provider_transaction_events_user_created_idx ON ${PROVIDER_EVENTS_TABLE}(user_id, created_at DESC)`);
    await q(`CREATE INDEX IF NOT EXISTS provider_transaction_events_token_idx ON ${PROVIDER_EVENTS_TABLE}(payment_link_token)`);

    await q(`CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_key_uidx ON ${WALLET_LEDGER_TABLE}(idempotency_key)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx ON ${WALLET_LEDGER_TABLE}(user_id, created_at DESC)`);
    await q(`CREATE INDEX IF NOT EXISTS wallet_ledger_reference_idx ON ${WALLET_LEDGER_TABLE}(reference_type, reference_id)`);

    // Backfill pending/completed deposit intents from legacy pending table.
    await q(`
      INSERT INTO ${DEPOSIT_ORDERS_TABLE} (
        user_id,
        provider,
        requested_amount,
        currency,
        status,
        payment_link_url,
        payment_link_token,
        provider_application_id,
        provider_transaction_id,
        link_expires_at,
        created_at,
        updated_at,
        metadata
      )
      SELECT
        p.user_id,
        COALESCE(NULLIF(p.provider, ''), 'orionstarspay'),
        p.amount,
        'USD',
        CASE
          WHEN LOWER(COALESCE(p.status, '')) = 'completed' THEN 'SUCCESS'
          WHEN LOWER(COALESCE(p.status, '')) = 'failed' THEN 'FAILED'
          WHEN LOWER(COALESCE(p.status, '')) = 'expired' THEN 'EXPIRED'
          ELSE 'PENDING'
        END,
        p.payment_link,
        NULLIF(p.provider_metadata->>'payinToken', ''),
        NULLIF(p.provider_metadata->>'centryosApplicationId', ''),
        NULLIF(p.provider_session_id, ''),
        CASE
          WHEN NULLIF(p.provider_metadata->>'payinExpiredAt', '') IS NULL THEN NULL
          ELSE (p.provider_metadata->>'payinExpiredAt')::timestamptz
        END,
        p.created_at,
        NOW(),
        jsonb_build_object('legacyPaymentPendingDepositId', p.id)
      FROM payment_pending_deposits p
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${DEPOSIT_ORDERS_TABLE} d
        WHERE d.metadata->>'legacyPaymentPendingDepositId' = p.id::text
      )
      ON CONFLICT DO NOTHING
    `);

    // Backfill successful records from legacy deposit requests (for historical continuity).
    await q(`
      INSERT INTO ${DEPOSIT_ORDERS_TABLE} (
        user_id,
        provider,
        requested_amount,
        currency,
        status,
        provider_transaction_id,
        completed_at,
        created_at,
        updated_at,
        metadata
      )
      SELECT
        d.user_id,
        COALESCE(NULLIF(d.provider, ''), 'orionstarspay'),
        d.amount,
        'USD',
        'SUCCESS',
        NULLIF(d.provider_transaction_id, ''),
        d.created_at,
        d.created_at,
        NOW(),
        jsonb_build_object('legacyDepositRequestId', d.id)
      FROM deposit_requests d
      WHERE COALESCE(NULLIF(d.provider, ''), 'orionstarspay') = 'orionstarspay'
        AND NOT EXISTS (
          SELECT 1
          FROM ${DEPOSIT_ORDERS_TABLE} o
          WHERE o.metadata->>'legacyDepositRequestId' = d.id::text
        )
      ON CONFLICT DO NOTHING
    `);

    // Backfill provider events from legacy transaction table.
    await q(`
      INSERT INTO ${PROVIDER_EVENTS_TABLE} (
        provider,
        provider_transaction_id,
        user_id,
        payment_link_token,
        event_type,
        provider_status,
        amount,
        currency,
        method,
        raw_payload,
        seen_at,
        created_at,
        updated_at
      )
      SELECT
        'orionstarspay',
        t.transaction_id,
        t.user_id,
        NULLIF(t.raw_payload#>>'{paymentLink,token}', ''),
        t.event_type,
        t.status,
        t.amount,
        COALESCE(t.currency, 'USD'),
        NULLIF(COALESCE(t.raw_payload->>'method', t.raw_payload#>>'{payload,method}'), ''),
        t.raw_payload,
        t.created_at,
        t.created_at,
        COALESCE(t.updated_at, t.created_at)
      FROM payment_transactions t
      ON CONFLICT (provider_transaction_id) DO NOTHING
    `);

    // Backfill ledger rows for already-completed legacy deposits.
    await q(`
      INSERT INTO ${WALLET_LEDGER_TABLE} (
        user_id,
        entry_type,
        asset_type,
        amount,
        reason,
        reference_type,
        reference_id,
        idempotency_key,
        metadata,
        created_at
      )
      SELECT
        d.user_id,
        'CREDIT',
        'SC',
        d.amount,
        'DEPOSIT_SUCCESS',
        'LEGACY_DEPOSIT_REQUEST',
        d.id::text,
        'legacy_deposit_request:' || d.id::text,
        jsonb_build_object(
          'legacyDepositRequestId', d.id,
          'provider', d.provider,
          'providerTransactionId', d.provider_transaction_id
        ),
        d.created_at
      FROM deposit_requests d
      WHERE COALESCE(NULLIF(d.provider, ''), 'orionstarspay') = 'orionstarspay'
      ON CONFLICT (idempotency_key) DO NOTHING
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(WALLET_LEDGER_TABLE, { transaction });
    await queryInterface.dropTable(PROVIDER_EVENTS_TABLE, { transaction });
    await queryInterface.dropTable(DEPOSIT_ORDERS_TABLE, { transaction });
  }
};
