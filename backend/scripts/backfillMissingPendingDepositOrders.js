'use strict';

require('dotenv').config({ override: true });

const db = require('../src/db/models');

async function run() {
  const [before] = await db.sequelize.query(`
    SELECT COUNT(*)::int AS missing_pending
    FROM payment_pending_deposits p
    LEFT JOIN deposit_orders d ON d.metadata->>'legacyPaymentPendingDepositId' = p.id::text
    WHERE d.id IS NULL
  `, { type: db.Sequelize.QueryTypes.SELECT });

  await db.sequelize.query(`
    INSERT INTO deposit_orders (
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
    LEFT JOIN deposit_orders d ON d.metadata->>'legacyPaymentPendingDepositId' = p.id::text
    WHERE d.id IS NULL
    ON CONFLICT DO NOTHING
  `);

  const [after] = await db.sequelize.query(`
    SELECT COUNT(*)::int AS missing_pending
    FROM payment_pending_deposits p
    LEFT JOIN deposit_orders d ON d.metadata->>'legacyPaymentPendingDepositId' = p.id::text
    WHERE d.id IS NULL
  `, { type: db.Sequelize.QueryTypes.SELECT });

  console.log(JSON.stringify({ before, after }, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
