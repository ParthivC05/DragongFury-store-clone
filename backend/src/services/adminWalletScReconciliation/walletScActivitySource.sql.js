'use strict';

/**
 * Historical SC movement lives on user_transactions. The dedicated ledger only
 * starts when the writer is deployed, so week/month would otherwise match day.
 *
 * Activity = non-snapshot ledger rows
 *          + mapped user_transactions dated before the first live ledger write.
 */

function productSql(nameExpr) {
  return `
    CASE
      WHEN LOWER(${nameExpr}) LIKE '%juwa 2%' OR LOWER(${nameExpr}) LIKE '%juwa2%' THEN 'JUWA20'
      WHEN LOWER(${nameExpr}) LIKE '%juwa%' THEN 'JUWA'
      WHEN LOWER(${nameExpr}) LIKE '%game vault 2%' OR LOWER(${nameExpr}) LIKE '%gamevault2%' THEN 'GAMEVAULT2'
      WHEN LOWER(${nameExpr}) LIKE '%game vault%' OR LOWER(${nameExpr}) LIKE '%gamevault%' THEN 'GAMEVAULT'
      WHEN LOWER(${nameExpr}) LIKE '%golden dragon%' OR LOWER(${nameExpr}) LIKE '%goldendragon%' THEN 'GOLDEN_DRAGON'
      WHEN LOWER(${nameExpr}) LIKE '%orion%' THEN 'ORIONSTARS'
      WHEN LOWER(${nameExpr}) LIKE '%egame%' THEN 'EGAME99'
      WHEN LOWER(${nameExpr}) LIKE '%fire kirin%' OR LOWER(${nameExpr}) LIKE '%firekirin%' THEN 'FIRE_KIRIN'
      WHEN LOWER(${nameExpr}) LIKE '%ultra panda%' OR LOWER(${nameExpr}) LIKE '%ultrapanda%' THEN 'ULTRA_PANDA'
      WHEN LOWER(${nameExpr}) LIKE '%panda master%' OR LOWER(${nameExpr}) LIKE '%pandamaster%' THEN 'PANDA_MASTER'
      WHEN LOWER(${nameExpr}) LIKE '%panda%' THEN 'PANDA'
      WHEN LOWER(${nameExpr}) LIKE '%vblink%' THEN 'VBLINK'
      WHEN LOWER(${nameExpr}) LIKE '%milky%' THEN 'MILKYWAY'
      WHEN LOWER(${nameExpr}) LIKE '%cash machine%' OR LOWER(${nameExpr}) LIKE '%cashmachine%' THEN 'CASH_MACHINE_777'
      WHEN LOWER(${nameExpr}) LIKE '%vegas%' THEN 'VEGASX'
      WHEN LOWER(${nameExpr}) LIKE '%game room%' OR LOWER(${nameExpr}) LIKE '%gameroom%' THEN 'GAMEROOM'
      WHEN LOWER(${nameExpr}) LIKE '%mafia%' THEN 'MAFIA'
      WHEN LOWER(${nameExpr}) LIKE '%lucky paradise%' THEN 'LUCKY_PARADISE'
      WHEN TRIM(${nameExpr}) <> '' THEN UPPER(REGEXP_REPLACE(TRIM(${nameExpr}), '[^a-zA-Z0-9]+', '_', 'g'))
      ELSE NULL
    END
  `;
}

function usedEventSql(productExpr) {
  return `
    CASE ${productExpr}
      WHEN 'JUWA' THEN 'USED_JUWA'
      WHEN 'GAMEVAULT' THEN 'USED_GAMEVAULT'
      WHEN 'GOLDEN_DRAGON' THEN 'USED_GOLDEN_DRAGON'
      WHEN 'DIRECT' THEN 'USED_DIRECT'
      WHEN 'GITSLOTPARK' THEN 'USED_DIRECT'
      WHEN 'ONEGAMEHUB' THEN 'USED_DIRECT'
      WHEN 'BONA' THEN 'USED_DIRECT'
      WHEN 'WIN568' THEN 'USED_DIRECT'
      ELSE 'USED_OTHER'
    END
  `;
}

function winEventSql(productExpr) {
  return `
    CASE ${productExpr}
      WHEN 'JUWA' THEN 'WIN_JUWA'
      WHEN 'GAMEVAULT' THEN 'WIN_GAMEVAULT'
      WHEN 'GOLDEN_DRAGON' THEN 'WIN_GOLDEN_DRAGON'
      WHEN 'DIRECT' THEN 'WIN_DIRECT'
      WHEN 'GITSLOTPARK' THEN 'WIN_DIRECT'
      WHEN 'ONEGAMEHUB' THEN 'WIN_DIRECT'
      WHEN 'BONA' THEN 'WIN_DIRECT'
      WHEN 'WIN568' THEN 'WIN_DIRECT'
      ELSE 'WIN_OTHER'
    END
  `;
}

function walletTypeSql(currencyExpr) {
  return `
    CASE UPPER(TRIM(COALESCE(${currencyExpr}, '')))
      WHEN 'BSC' THEN 'BONUS'
      WHEN 'RSC' THEN 'RSC'
      ELSE 'PSC'
    END
  `;
}

function txRangeSql() {
  return `
      AND ut.created_at >= :from
      AND ut.created_at <= :activityTo
      AND ut.created_at < :ledgerStart
  `;
}

function txTailSql() {
  return `
      ut.user_id,
      NULL::varchar AS store_code,
      CASE
        WHEN (ut.metadata->>'gameId') ~ '^[0-9]+$' THEN (ut.metadata->>'gameId')::int
        ELSE NULL
      END AS game_id,
      COALESCE(ut.metadata->>'provider', ut.metadata->>'gameId', ut.metadata->>'game_name') AS provider_id,
      ut.type AS source_type,
      ut.id::text AS source_id,
      ut.description AS remarks,
      COALESCE(ut.metadata->>'provider_transaction_id', NULL) AS payment_id,
      NULLIF(ut.metadata->>'package_id', '')::int AS package_id,
      ut.metadata->>'roundId' AS round_id,
      NULL::bigint AS parent_transaction_id,
      NULL::int AS created_by,
      ut.metadata,
      COALESCE(NULLIF(ut.metadata->>'gross_amount', '')::numeric, ut.amount) AS gross_amount,
      ut.amount AS eligible_amount,
      COALESCE(NULLIF(ut.metadata->>'voided_amount', '')::numeric, 0) AS voided_amount,
      FALSE AS is_bonus_origin,
      ut.created_at
  `;
}

function mappedUserTxSql() {
  const gameName = `COALESCE(ut.metadata->>'game_name', ut.metadata->>'gameId', '')`;
  const namedProduct = productSql(gameName);
  const impact = `
    COALESCE(
      CASE UPPER(TRIM(COALESCE(ut.currency_code, '')))
        WHEN 'BSC' THEN NULLIF(ut.metadata->'walletImpact'->>'bsc', '')::numeric
        WHEN 'RSC' THEN NULLIF(ut.metadata->'walletImpact'->>'rsc', '')::numeric
        ELSE COALESCE(NULLIF(ut.metadata->'walletImpact'->>'psc', '')::numeric, NULLIF(ut.metadata->'walletImpact'->>'sc', '')::numeric)
      END,
      0
    )
  `;
  const walletType = walletTypeSql('ut.currency_code');
  const gameProduct = `COALESCE(${namedProduct}, 'OTHER')`;
  const hasPackageExtra = `
    ut.type = 'deposit'
    AND NULLIF(ut.metadata->>'pay_amount', '') IS NOT NULL
    AND COALESCE(NULLIF(ut.metadata->>'credit_sc', '')::numeric, ut.amount)
        - NULLIF(ut.metadata->>'pay_amount', '')::numeric > 0.004
  `;
  const fundingPsc = `COALESCE(NULLIF(ut.metadata->'funding'->>'psc', ''), '0')::numeric`;
  const fundingBsc = `COALESCE(NULLIF(ut.metadata->'funding'->>'bsc', ''), '0')::numeric`;
  const fundingRsc = `COALESCE(NULLIF(ut.metadata->'funding'->>'rsc', ''), '0')::numeric`;
  const hasFunding = `ut.type = 'game_deposit' AND ut.metadata ? 'funding' AND (${fundingPsc} + ${fundingBsc} + ${fundingRsc}) > 0.004`;
  const gameDepositPlain = `ut.type = 'game_deposit' AND NOT (${hasFunding})`;

  return `
    SELECT
      -(ut.id::bigint * 10 + x.n) AS id,
      x.wallet_type,
      x.direction,
      x.amount,
      x.event_type,
      x.bonus_type,
      x.product_id,
      x.product_type,
      ${txTailSql()}
    FROM user_transactions ut
    CROSS JOIN LATERAL (
      SELECT * FROM (
        SELECT
          0 AS n,
          ${walletType} AS wallet_type,
          CASE
            WHEN ut.type IN (
              'withdraw', 'admin_deduct',
              'gitslotpark_withdraw', 'onegamehub_bet', 'bona_bet',
              'win568_deduct', 'win568_settle_reverse', 'win568_raise_reverse'
            ) THEN 'DEBIT'
            WHEN ut.type IN ('gitslotpark_betwin', 'gitslotpark_rollback', 'win568_adjust') THEN
              CASE WHEN ${impact} < 0 THEN 'DEBIT' ELSE 'CREDIT' END
            ELSE 'CREDIT'
          END AS direction,
          ut.amount,
          CASE ut.type
            WHEN 'deposit' THEN 'PURCHASE'
            WHEN 'welcome_signup' THEN 'WELCOME_BONUS'
            WHEN 'spin_wheel' THEN 'SPIN_BONUS'
            WHEN 'daily_bonus' THEN 'DAILY_BONUS'
            WHEN 'daily_bonus_spin' THEN 'DAILY_BONUS'
            WHEN 'referral_friend_signup' THEN 'REFERRAL_BONUS'
            WHEN 'affiliate' THEN 'REFERRAL_BONUS'
            WHEN 'vip_bonus' THEN 'VIP_BONUS'
            WHEN 'bonus_code' THEN 'BONUS_CODE'
            WHEN 'promotion' THEN 'OTHER_BONUS'
            WHEN 'deposit_courtesy' THEN 'OTHER_BONUS'
            WHEN 'admin_add' THEN CASE WHEN UPPER(TRIM(ut.currency_code)) = 'BSC' THEN 'MANUAL_BONUS' ELSE 'MANUAL_CREDIT' END
            WHEN 'admin_deduct' THEN 'MANUAL_DEBIT'
            WHEN 'withdraw' THEN 'WITHDRAWAL'
            WHEN 'game_withdraw' THEN ${winEventSql(gameProduct)}
            WHEN 'game_deposit' THEN ${usedEventSql(gameProduct)}
            WHEN 'onegamehub_bet' THEN 'USED_DIRECT'
            WHEN 'onegamehub_win' THEN 'WIN_DIRECT'
            WHEN 'onegamehub_cancel' THEN 'REFUND'
            WHEN 'gitslotpark_withdraw' THEN 'USED_DIRECT'
            WHEN 'gitslotpark_deposit' THEN 'WIN_DIRECT'
            WHEN 'gitslotpark_betwin' THEN CASE WHEN ${impact} < 0 THEN 'USED_DIRECT' ELSE 'WIN_DIRECT' END
            WHEN 'gitslotpark_rollback' THEN 'REFUND'
            WHEN 'bona_bet' THEN 'USED_DIRECT'
            WHEN 'bona_settlement' THEN 'WIN_DIRECT'
            WHEN 'bona_fishing' THEN 'WIN_DIRECT'
            WHEN 'bona_refund' THEN 'REFUND'
            WHEN 'win568_deduct' THEN 'USED_DIRECT'
            WHEN 'win568_settle' THEN 'WIN_DIRECT'
            WHEN 'win568_deduct_reverse' THEN 'REFUND'
            WHEN 'win568_settle_reverse' THEN 'VOIDED'
            WHEN 'win568_raise_reverse' THEN 'VOIDED'
            WHEN 'win568_bonus' THEN 'OTHER_BONUS'
            WHEN 'win568_adjust' THEN CASE WHEN ${impact} < 0 THEN 'MANUAL_DEBIT' ELSE 'MANUAL_CREDIT' END
            ELSE 'UNCLASSIFIED'
          END AS event_type,
          CASE ut.type
            WHEN 'welcome_signup' THEN 'WELCOME_BONUS'
            WHEN 'spin_wheel' THEN 'SPIN_BONUS'
            WHEN 'daily_bonus' THEN 'DAILY_BONUS'
            WHEN 'daily_bonus_spin' THEN 'DAILY_BONUS'
            WHEN 'referral_friend_signup' THEN 'REFERRAL_BONUS'
            WHEN 'affiliate' THEN 'REFERRAL_BONUS'
            WHEN 'vip_bonus' THEN 'VIP_BONUS'
            WHEN 'bonus_code' THEN 'BONUS_CODE'
            WHEN 'deposit_courtesy' THEN 'OTHER_BONUS'
            WHEN 'promotion' THEN 'OTHER_BONUS'
            WHEN 'admin_add' THEN CASE WHEN UPPER(TRIM(ut.currency_code)) = 'BSC' THEN 'MANUAL_BONUS' ELSE NULL END
            ELSE NULL
          END AS bonus_type,
          CASE
            WHEN ut.type LIKE 'gitslotpark%' THEN 'GITSLOTPARK'
            WHEN ut.type LIKE 'onegamehub%' THEN 'ONEGAMEHUB'
            WHEN ut.type LIKE 'bona_%' THEN 'BONA'
            WHEN ut.type LIKE 'win568%' THEN 'WIN568'
            WHEN ut.type IN ('game_withdraw', 'game_deposit') THEN COALESCE(${namedProduct}, 'OTHER')
            ELSE NULL
          END AS product_id,
          CASE
            WHEN ut.type LIKE 'gitslotpark%' OR ut.type LIKE 'onegamehub%' OR ut.type LIKE 'bona_%' OR ut.type LIKE 'win568%' THEN 'DIRECT'
            WHEN ut.type IN ('game_withdraw', 'game_deposit') THEN 'EXTERNAL'
            ELSE NULL
          END AS product_type
        WHERE ut.type <> 'game_deposit' AND NOT (${hasPackageExtra})
          AND ABS(ut.amount) > 0.004

        UNION ALL
        SELECT f.n, f.wallet_type, 'DEBIT', f.amount,
          ${usedEventSql(gameProduct)}, NULL, ${gameProduct}, 'EXTERNAL'
        FROM (VALUES
          (1, 'PSC', ${fundingPsc}),
          (2, 'BONUS', ${fundingBsc}),
          (3, 'RSC', ${fundingRsc})
        ) AS f(n, wallet_type, amount)
        WHERE ${hasFunding} AND f.amount > 0.004

        UNION ALL
        SELECT 0, 'PSC', 'DEBIT', ut.amount,
          ${usedEventSql(gameProduct)}, NULL, ${gameProduct}, 'EXTERNAL'
        WHERE ${gameDepositPlain} AND ABS(ut.amount) > 0.004

        UNION ALL
        SELECT d.n, d.wallet_type, 'CREDIT', d.amount, d.event_type, d.bonus_type, NULL, NULL
        FROM (
          SELECT
            COALESCE(NULLIF(ut.metadata->>'pay_amount', '')::numeric, 0) AS pay_amount,
            COALESCE(NULLIF(ut.metadata->>'credit_sc', '')::numeric, ut.amount) AS credit_sc
        ) p
        CROSS JOIN LATERAL (VALUES
          (1, 'PSC'::text, 'PURCHASE'::text, NULL::text, p.pay_amount),
          (2, 'BONUS', 'PACKAGE_BONUS', 'PACKAGE_BONUS', GREATEST(p.credit_sc - p.pay_amount, 0))
        ) AS d(n, wallet_type, event_type, bonus_type, amount)
        WHERE ${hasPackageExtra} AND d.amount > 0.004
      ) s
    ) x
    WHERE 1=1
      ${txRangeSql()}
  `;
}

function activitySourceSql() {
  return `
    (
      SELECT
        l0.id,
        l0.user_id,
        l0.store_code,
        l0.wallet_type,
        l0.direction,
        l0.amount,
        l0.event_type,
        l0.bonus_type,
        l0.product_id,
        l0.product_type,
        l0.provider_id,
        l0.game_id,
        l0.source_type,
        l0.source_id,
        l0.remarks,
        l0.payment_id,
        l0.package_id,
        l0.round_id,
        l0.parent_transaction_id,
        l0.created_by,
        l0.metadata,
        l0.gross_amount,
        l0.eligible_amount,
        l0.voided_amount,
        l0.is_bonus_origin,
        l0.created_at
      FROM wallet_sc_ledger l0
      WHERE l0.event_type <> 'OPENING_SNAPSHOT'
        AND l0.created_at >= :from
        AND l0.created_at <= :activityTo

      UNION ALL

      SELECT
        m.id,
        m.user_id,
        m.store_code,
        m.wallet_type,
        m.direction,
        m.amount,
        m.event_type,
        m.bonus_type,
        m.product_id,
        m.product_type,
        m.provider_id,
        m.game_id,
        m.source_type,
        m.source_id,
        m.remarks,
        m.payment_id,
        m.package_id,
        m.round_id,
        m.parent_transaction_id,
        m.created_by,
        m.metadata,
        m.gross_amount,
        m.eligible_amount,
        m.voided_amount,
        m.is_bonus_origin,
        m.created_at
      FROM (
        ${mappedUserTxSql()}
      ) m
      WHERE m.created_at < :ledgerStart
    )
  `;
}

const FAR_FUTURE = new Date('9999-12-31T00:00:00.000Z');

async function getLedgerLiveStart(sequelize, QueryTypes) {
  const rows = await sequelize.query(
    `SELECT MIN(created_at) AS t FROM wallet_sc_ledger WHERE event_type <> 'OPENING_SNAPSHOT'`,
    { type: QueryTypes.SELECT }
  );
  return rows[0]?.t ? new Date(rows[0].t) : FAR_FUTURE;
}

module.exports = {
  activitySourceSql,
  mappedUserTxSql,
  getLedgerLiveStart,
  FAR_FUTURE
};
