'use strict';

require('dotenv').config({ override: true });

const db = require('../src/db/models');

async function run() {
  const q = (sql) => db.sequelize.query(sql, { type: db.Sequelize.QueryTypes.SELECT });
  const results = {};

  results.pendingCoverage = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM payment_pending_deposits) AS old_pending_total,
      (SELECT COUNT(*)::int FROM deposit_orders WHERE metadata ? 'legacyPaymentPendingDepositId') AS new_from_pending_total
  `);

  results.depositReqCoverage = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM deposit_requests WHERE COALESCE(NULLIF(provider,''), 'orionstarspay') = 'orionstarspay') AS old_deposit_requests_total,
      (SELECT COUNT(*)::int FROM deposit_orders WHERE metadata ? 'legacyDepositRequestId') AS new_from_deposit_requests_total
  `);

  results.paymentTxCoverage = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM payment_transactions WHERE transaction_id IS NOT NULL) AS old_payment_tx_total,
      (SELECT COUNT(*)::int FROM provider_transaction_events) AS new_provider_events_total
  `);

  results.ledgerCoverage = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM deposit_requests WHERE COALESCE(NULLIF(provider,''), 'orionstarspay')='orionstarspay') AS old_success_rows,
      (SELECT COUNT(*)::int FROM wallet_ledger WHERE idempotency_key LIKE 'legacy_deposit_request:%') AS new_ledger_legacy_rows
  `);

  results.missingPending = await q(`
    SELECT COUNT(*)::int AS missing_pending
    FROM payment_pending_deposits p
    LEFT JOIN deposit_orders d ON d.metadata->>'legacyPaymentPendingDepositId' = p.id::text
    WHERE d.id IS NULL
  `);

  results.missingDepositOrders = await q(`
    SELECT COUNT(*)::int AS missing_deposit_orders
    FROM deposit_requests d1
    LEFT JOIN deposit_orders d2 ON d2.metadata->>'legacyDepositRequestId' = d1.id::text
    WHERE COALESCE(NULLIF(d1.provider,''), 'orionstarspay')='orionstarspay'
      AND d2.id IS NULL
  `);

  results.missingEvents = await q(`
    SELECT COUNT(*)::int AS missing_events
    FROM payment_transactions t
    LEFT JOIN provider_transaction_events e ON e.provider_transaction_id = t.transaction_id
    WHERE t.transaction_id IS NOT NULL
      AND e.id IS NULL
  `);

  results.missingLedger = await q(`
    SELECT COUNT(*)::int AS missing_ledger
    FROM deposit_requests d
    LEFT JOIN wallet_ledger l ON l.idempotency_key = 'legacy_deposit_request:' || d.id::text
    WHERE COALESCE(NULLIF(d.provider,''), 'orionstarspay')='orionstarspay'
      AND l.id IS NULL
  `);

  console.log(JSON.stringify(results, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
