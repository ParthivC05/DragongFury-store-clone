'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const {
  resolveDateRange,
  scopeSql,
  parsePageLimit,
  round2
} = require('./getWalletScReconciliation.service');
const { activitySourceSql, getLedgerLiveStart } = require('./walletScActivitySource.sql');

const METRIC_FILTERS = {
  psc_purchased: { walletType: 'PSC', direction: 'CREDIT', eventTypes: ['PURCHASE'] },
  psc_manual_credits: { walletType: 'PSC', direction: 'CREDIT', eventTypes: ['MANUAL_CREDIT', 'ADJUSTMENT_CREDIT', 'REFUND'] },
  psc_used_juwa: { walletType: 'PSC', direction: 'DEBIT', eventTypes: ['USED_JUWA'] },
  psc_used_gamevault: { walletType: 'PSC', direction: 'DEBIT', eventTypes: ['USED_GAMEVAULT'] },
  psc_used_goldendragon: { walletType: 'PSC', direction: 'DEBIT', eventTypes: ['USED_GOLDEN_DRAGON'] },
  psc_used_direct: { walletType: 'PSC', direction: 'DEBIT', eventTypes: ['USED_DIRECT'] },
  psc_other_debits: { walletType: 'PSC', direction: 'DEBIT', eventTypes: ['USED_OTHER', 'MANUAL_DEBIT', 'ADJUSTMENT_DEBIT', 'NEVER_DEPOSITED_CLEAR', 'UNCLASSIFIED'] },
  psc_credits: { walletType: 'PSC', direction: 'CREDIT' },
  psc_debits: { walletType: 'PSC', direction: 'DEBIT', excludeEvents: ['OPENING_SNAPSHOT'] },

  bonus_package: { walletType: 'BONUS', direction: 'CREDIT', eventTypes: ['PACKAGE_BONUS'] },
  bonus_welcome: { walletType: 'BONUS', direction: 'CREDIT', eventTypes: ['WELCOME_BONUS'] },
  bonus_spin: { walletType: 'BONUS', direction: 'CREDIT', eventTypes: ['SPIN_BONUS'] },
  bonus_referral: { walletType: 'BONUS', direction: 'CREDIT', eventTypes: ['REFERRAL_BONUS'] },
  bonus_coinback: { walletType: 'BONUS', direction: 'CREDIT', eventTypes: ['COINBACK'] },
  bonus_other_issued: { walletType: 'BONUS', direction: 'CREDIT', eventTypes: ['DAILY_BONUS', 'VIP_BONUS', 'BONUS_CODE', 'MANUAL_BONUS', 'OTHER_BONUS', 'UNCLASSIFIED', 'ADJUSTMENT_CREDIT', 'REFUND'] },
  bonus_used_juwa: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['USED_JUWA'] },
  bonus_used_gamevault: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['USED_GAMEVAULT'] },
  bonus_used_goldendragon: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['USED_GOLDEN_DRAGON'] },
  bonus_used_direct: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['USED_DIRECT'] },
  bonus_expired: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['EXPIRED'] },
  bonus_voided: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['VOIDED', 'NEVER_DEPOSITED_CLEAR'] },
  bonus_cashout_cap: { walletType: 'BONUS', direction: 'DEBIT', eventTypes: ['CASHOUT_CAP_VOID'] },
  bonus_credits: { walletType: 'BONUS', direction: 'CREDIT' },
  bonus_debits: { walletType: 'BONUS', direction: 'DEBIT' },

  rsc_from_juwa: { walletType: 'RSC', direction: 'CREDIT', eventTypes: ['WIN_JUWA'] },
  rsc_from_gamevault: { walletType: 'RSC', direction: 'CREDIT', eventTypes: ['WIN_GAMEVAULT'] },
  rsc_from_goldendragon: { walletType: 'RSC', direction: 'CREDIT', eventTypes: ['WIN_GOLDEN_DRAGON'] },
  rsc_from_direct: { walletType: 'RSC', direction: 'CREDIT', eventTypes: ['WIN_DIRECT'] },
  rsc_gross_bonus: { walletType: 'RSC', direction: 'CREDIT', winOnly: true },
  rsc_bonus_voided: { walletType: 'RSC', direction: 'DEBIT', eventTypes: ['CASHOUT_CAP_VOID'] },
  rsc_eligible: { walletType: 'RSC', direction: 'CREDIT', winOnly: true },
  rsc_withdrawals: { walletType: 'RSC', direction: 'DEBIT', eventTypes: ['WITHDRAWAL'] },
  rsc_other_debits: { walletType: 'RSC', direction: 'DEBIT', eventTypes: ['VOIDED', 'MANUAL_DEBIT', 'ADJUSTMENT_DEBIT', 'USED_JUWA', 'USED_GAMEVAULT', 'USED_GOLDEN_DRAGON', 'USED_DIRECT', 'USED_OTHER', 'NEVER_DEPOSITED_CLEAR'] },
  rsc_credits: { walletType: 'RSC', direction: 'CREDIT' },
  rsc_debits: { walletType: 'RSC', direction: 'DEBIT' },

  product_juwa_psc: { walletType: 'PSC', direction: 'DEBIT', productId: 'JUWA' },
  product_juwa_bonus: { walletType: 'BONUS', direction: 'DEBIT', productId: 'JUWA' },
  product_juwa_rsc: { walletType: 'RSC', direction: 'CREDIT', productId: 'JUWA' },
  product_gamevault_psc: { walletType: 'PSC', direction: 'DEBIT', productId: 'GAMEVAULT' },
  product_gamevault_bonus: { walletType: 'BONUS', direction: 'DEBIT', productId: 'GAMEVAULT' },
  product_gamevault_rsc: { walletType: 'RSC', direction: 'CREDIT', productId: 'GAMEVAULT' },
  product_goldendragon_psc: { walletType: 'PSC', direction: 'DEBIT', productId: 'GOLDEN_DRAGON' },
  product_goldendragon_bonus: { walletType: 'BONUS', direction: 'DEBIT', productId: 'GOLDEN_DRAGON' },
  product_goldendragon_rsc: { walletType: 'RSC', direction: 'CREDIT', productId: 'GOLDEN_DRAGON' },
  product_golden_dragon_psc: { walletType: 'PSC', direction: 'DEBIT', productId: 'GOLDEN_DRAGON' },
  product_golden_dragon_bonus: { walletType: 'BONUS', direction: 'DEBIT', productId: 'GOLDEN_DRAGON' },
  product_golden_dragon_rsc: { walletType: 'RSC', direction: 'CREDIT', productId: 'GOLDEN_DRAGON' },
  product_direct_psc: { walletType: 'PSC', direction: 'DEBIT', productId: 'DIRECT' },
  product_direct_bonus: { walletType: 'BONUS', direction: 'DEBIT', productId: 'DIRECT' },
  product_direct_rsc: { walletType: 'RSC', direction: 'CREDIT', productId: 'DIRECT' },

  mismatch: { mismatchOnly: true }
};

function metricClause(metric, replacements) {
  let spec = METRIC_FILTERS[metric];
  if (!spec) {
    const used = /^product_(.+)_rsc_used$/i.exec(String(metric || ''));
    const win = !used && /^product_(.+)_rsc$/i.exec(String(metric || ''));
    const bonus = /^product_(.+)_bonus$/i.exec(String(metric || ''));
    const psc = /^product_(.+)_psc$/i.exec(String(metric || ''));
    if (used) spec = { walletType: 'RSC', direction: 'DEBIT', productId: used[1].toUpperCase(), usedOnly: true };
    else if (win) spec = { walletType: 'RSC', direction: 'CREDIT', productId: win[1].toUpperCase() };
    else if (bonus) spec = { walletType: 'BONUS', direction: 'DEBIT', productId: bonus[1].toUpperCase() };
    else if (psc) spec = { walletType: 'PSC', direction: 'DEBIT', productId: psc[1].toUpperCase() };
  }
  if (!spec) return { sql: 'TRUE', bind: {} };
  const parts = [];
  const bind = {};
  if (spec.walletType) {
    bind.metricWallet = spec.walletType;
    parts.push('l.wallet_type = :metricWallet');
  }
  if (spec.direction) {
    bind.metricDirection = spec.direction;
    parts.push('l.direction = :metricDirection');
  }
  if (spec.eventTypes && spec.eventTypes.length) {
    parts.push(`l.event_type IN (${spec.eventTypes.map((_, i) => `:evt${i}`).join(', ')})`);
    spec.eventTypes.forEach((evt, i) => { bind[`evt${i}`] = evt; });
  }
  if (spec.excludeEvents && spec.excludeEvents.length) {
    parts.push(`l.event_type NOT IN (${spec.excludeEvents.map((_, i) => `:ex${i}`).join(', ')})`);
    spec.excludeEvents.forEach((evt, i) => { bind[`ex${i}`] = evt; });
  }
  if (spec.productId) {
    bind.metricProduct = spec.productId;
    parts.push('l.product_id = :metricProduct');
  }
  if (spec.winOnly) {
    parts.push(`l.event_type LIKE 'WIN_%'`);
  }
  if (spec.usedOnly) {
    parts.push(`l.event_type LIKE 'USED_%'`);
  }
  if (spec.mismatchOnly) {
    parts.push(`l.event_type <> 'OPENING_SNAPSHOT'`);
  }
  Object.assign(replacements, bind);
  return { sql: parts.length ? parts.join(' AND ') : 'TRUE' };
}

async function getWalletScReconciliationEntries({
  startDate,
  endDate,
  timezoneOffset,
  storeCode,
  userId,
  username,
  metric,
  productId,
  providerId,
  gameId,
  page,
  limit
}) {
  const range = resolveDateRange(startDate, endDate, timezoneOffset);
  const { sql: userSql, bind } = scopeSql({ storeCode, userId, username });
  const paging = parsePageLimit(page, limit);
  const ledgerStart = await getLedgerLiveStart(db.sequelize, QueryTypes);
  const replacements = {
    ...bind,
    from: range.from,
    to: range.to,
    ledgerStart,
    activityTo: range.to,
    limit: paging.limit,
    offset: paging.offset
  };

  const metricSql = metricClause(metric, replacements);
  const extra = [];
  if (productId) {
    replacements.filterProduct = String(productId);
    extra.push('l.product_id = :filterProduct');
  }
  if (providerId) {
    replacements.filterProvider = String(providerId);
    extra.push('l.provider_id = :filterProvider');
  }
  if (gameId) {
    replacements.filterGameId = parseInt(gameId, 10);
    extra.push('l.game_id = :filterGameId');
  }

  const where = [
    userSql,
    'l.created_at >= :from',
    'l.created_at <= :to',
    metricSql.sql,
    ...extra
  ].filter(Boolean).join(' AND ');

  const countRows = await db.sequelize.query(
    `SELECT COUNT(*)::int AS c
     FROM ${activitySourceSql()} l
     JOIN users u ON u.user_id = l.user_id
     WHERE ${where}`,
    { replacements, type: QueryTypes.SELECT }
  );
  const total = Number(countRows[0]?.c) || 0;

  const rows = await db.sequelize.query(
    `
    SELECT
      l.id,
      l.user_id AS "userId",
      u.username,
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.store_code AS "storeCode",
      l.wallet_type AS "walletType",
      l.direction,
      l.amount::float AS amount,
      l.event_type AS "eventType",
      l.bonus_type AS "bonusType",
      l.product_id AS "productId",
      l.product_type AS "productType",
      l.provider_id AS "providerId",
      l.game_id AS "gameId",
      g.name AS "gameName",
      l.round_id AS "roundId",
      l.payment_id AS "paymentId",
      l.package_id AS "packageId",
      l.source_type AS "sourceType",
      l.source_id AS "sourceId",
      l.parent_transaction_id AS "parentTransactionId",
      l.created_by AS "createdBy",
      l.remarks,
      l.gross_amount::float AS "grossAmount",
      l.eligible_amount::float AS "eligibleAmount",
      l.voided_amount::float AS "voidedAmount",
      l.is_bonus_origin AS "isBonusOrigin",
      l.metadata,
      l.created_at AS "createdAt"
    FROM ${activitySourceSql()} l
    JOIN users u ON u.user_id = l.user_id
    LEFT JOIN games g ON g.id = l.game_id
    WHERE ${where}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT :limit OFFSET :offset
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  let drilldown = null;
  if (metric === 'product_direct_psc' || metric === 'product_direct_bonus' || metric === 'product_direct_rsc' || ['DIRECT', 'GITSLOTPARK', 'ONEGAMEHUB', 'BONA', 'WIN568'].includes(productId)) {
    drilldown = await db.sequelize.query(
      `
      SELECT
        COALESCE(l.provider_id, 'unknown') AS "providerId",
        l.game_id AS "gameId",
        g.name AS "gameName",
        COALESCE(SUM(CASE WHEN l.wallet_type = 'PSC' AND l.direction = 'DEBIT' THEN l.amount ELSE 0 END), 0)::float AS "pscUsed",
        COALESCE(SUM(CASE WHEN l.wallet_type = 'BONUS' AND l.direction = 'DEBIT' THEN l.amount ELSE 0 END), 0)::float AS "bonusUsed",
        COALESCE(SUM(CASE WHEN l.wallet_type = 'RSC' AND l.direction = 'DEBIT' AND l.event_type LIKE 'USED_%' THEN l.amount ELSE 0 END), 0)::float AS "rscUsed",
        COALESCE(SUM(CASE WHEN l.wallet_type = 'RSC' AND l.direction = 'CREDIT' THEN l.amount ELSE 0 END), 0)::float AS "rscGenerated"
      FROM ${activitySourceSql()} l
      JOIN users u ON u.user_id = l.user_id
      LEFT JOIN games g ON g.id = l.game_id
      WHERE ${userSql}
        AND l.created_at >= :from AND l.created_at <= :to
        AND l.product_id = :slotProduct
      GROUP BY 1, 2, 3
      ORDER BY 1, 3
      `,
      { replacements: { ...bind, from: range.from, to: range.to, ledgerStart, activityTo: range.to, slotProduct: productId || 'DIRECT' }, type: QueryTypes.SELECT }
    );
  }

  return {
    metric: metric || 'all',
    total,
    page: paging.page,
    limit: paging.limit,
    rows: rows.map((row) => ({
      ...row,
      amount: round2(row.amount),
      displayName: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null
    })),
    drilldown
  };
}

module.exports = {
  getWalletScReconciliationEntries,
  METRIC_FILTERS
};
