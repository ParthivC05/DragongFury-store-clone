'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const {
  resolveDateRange,
  scopeSql,
  parsePageLimit,
  round2
} = require('../adminWalletScReconciliation/getWalletScReconciliation.service');
const { activitySourceSql, getLedgerLiveStart } = require('../adminWalletScReconciliation/walletScActivitySource.sql');
const {
  CASINO_PRODUCTS,
  BONUS_CREDIT_EVENTS,
  ADMIN_CREDIT_EVENTS,
  ADMIN_DEBIT_EVENTS,
  casinoHubSql,
  platformGameKeySql
} = require('./dailyScReport.constants');

function sqlInStrings(values) {
  const list = [...values].filter((v) => v != null && String(v).trim() !== '');
  if (!list.length) return `'__none__'`;
  return list.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
}

function casinoSql() {
  const products = sqlInStrings(CASINO_PRODUCTS);
  return `(
    COALESCE(l.product_id, '') IN (${products})
    OR COALESCE(l.product_type, '') = 'DIRECT'
    OR l.event_type IN ('USED_DIRECT', 'WIN_DIRECT')
  )`;
}

function metricClause(metric, replacements) {
  const m = String(metric || 'total_in');
  const parts = [];
  if (m === 'total_in' || m === 'credits') {
    parts.push(`l.direction = 'CREDIT'`);
  } else if (m === 'total_out' || m === 'debits') {
    parts.push(`l.direction = 'DEBIT'`);
  } else if (m === 'deposits') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type = 'PURCHASE'`);
  } else if (m === 'bonuses') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`(
      l.event_type IN (${sqlInStrings(BONUS_CREDIT_EVENTS)})
      OR (l.wallet_type = 'BONUS' AND l.event_type NOT LIKE 'WIN_%')
    )`);
  } else if (m.startsWith('bonus_type:')) {
    replacements.bonusType = m.slice('bonus_type:'.length);
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`COALESCE(l.bonus_type, l.event_type, '') = :bonusType`);
  } else if (m === 'game_wins') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type LIKE 'WIN_%'`);
  } else if (m === 'casino_wins') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type LIKE 'WIN_%'`);
    parts.push(casinoSql());
  } else if (m === 'platform_wins') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type LIKE 'WIN_%'`);
    parts.push(`NOT ${casinoSql()}`);
  } else if (m === 'other_in') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type <> 'PURCHASE'`);
    parts.push(`l.event_type NOT LIKE 'WIN_%'`);
    parts.push(`NOT (
      l.event_type IN (${sqlInStrings(BONUS_CREDIT_EVENTS)})
      OR (l.wallet_type = 'BONUS' AND l.event_type NOT LIKE 'WIN_%')
    )`);
  } else if (m === 'casino_used') {
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type LIKE 'USED_%'`);
    parts.push(casinoSql());
  } else if (m === 'platform_used') {
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type LIKE 'USED_%'`);
    parts.push(`NOT ${casinoSql()}`);
  } else if (m === 'withdrawals') {
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type = 'WITHDRAWAL'`);
  } else if (m === 'other_out') {
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type NOT LIKE 'USED_%'`);
    parts.push(`l.event_type <> 'WITHDRAWAL'`);
  } else if (m === 'admin_add') {
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type IN (${sqlInStrings(ADMIN_CREDIT_EVENTS)})`);
  } else if (m === 'admin_remove') {
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type IN (${sqlInStrings(ADMIN_DEBIT_EVENTS)})`);
  } else if (m === 'sc_bought') {
    parts.push(`l.wallet_type = 'PSC'`);
  } else if (m === 'sc_bonus') {
    parts.push(`l.wallet_type = 'BONUS'`);
  } else if (m === 'sc_win') {
    parts.push(`l.wallet_type = 'RSC'`);
  } else if (m === 'sc_bought_in') {
    parts.push(`l.wallet_type = 'PSC' AND l.direction = 'CREDIT'`);
  } else if (m === 'sc_bought_out') {
    parts.push(`l.wallet_type = 'PSC' AND l.direction = 'DEBIT'`);
  } else if (m === 'sc_bonus_in') {
    parts.push(`l.wallet_type = 'BONUS' AND l.direction = 'CREDIT'`);
  } else if (m === 'sc_bonus_out') {
    parts.push(`l.wallet_type = 'BONUS' AND l.direction = 'DEBIT'`);
  } else if (m === 'sc_win_in') {
    parts.push(`l.wallet_type = 'RSC' AND l.direction = 'CREDIT'`);
  } else if (m === 'sc_win_out') {
    parts.push(`l.wallet_type = 'RSC' AND l.direction = 'DEBIT'`);
  } else if (m.startsWith('casino_provider:')) {
    replacements.filterProvider = m.slice('casino_provider:'.length);
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type LIKE 'USED_%'`);
    parts.push(casinoSql());
    parts.push(`${casinoHubSql('l')} = :filterProvider`);
  } else if (m.startsWith('casino_win_provider:')) {
    replacements.filterProvider = m.slice('casino_win_provider:'.length);
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type LIKE 'WIN_%'`);
    parts.push(casinoSql());
    parts.push(`${casinoHubSql('l')} = :filterProvider`);
  } else if (m.startsWith('platform_game:')) {
    replacements.filterProduct = String(m.slice('platform_game:'.length)).toLowerCase().replace(/[^a-z0-9]+/g, '');
    parts.push(`l.direction = 'DEBIT'`);
    parts.push(`l.event_type LIKE 'USED_%'`);
    parts.push(`NOT ${casinoSql()}`);
    parts.push(`${platformGameKeySql('l', 'g')} = :filterProduct`);
  } else if (m.startsWith('platform_redeem:')) {
    replacements.filterProduct = String(m.slice('platform_redeem:'.length)).toLowerCase().replace(/[^a-z0-9]+/g, '');
    parts.push(`l.direction = 'CREDIT'`);
    parts.push(`l.event_type LIKE 'WIN_%'`);
    parts.push(`NOT ${casinoSql()}`);
    parts.push(`${platformGameKeySql('l', 'g')} = :filterProduct`);
  } else {
    parts.push('TRUE');
  }
  return parts.join(' AND ');
}

async function getDailyScReportEntries({
  startDate,
  endDate,
  timezoneOffset,
  storeCode,
  metric,
  productId,
  providerId,
  gameId,
  page,
  limit
}) {
  const range = resolveDateRange(startDate, endDate, timezoneOffset);
  const { sql: userSql, bind } = scopeSql({ storeCode });
  const paging = parsePageLimit(page, limit);

  const ledgerStart = await getLedgerLiveStart(db.sequelize, QueryTypes);
  const replacements = {
    ...bind,
    from: range.from,
    to: range.to,
    activityTo: range.to,
    ledgerStart,
    limit: paging.limit,
    offset: paging.offset
  };

  const extra = [metricClause(metric, replacements)];
  if (productId) {
    replacements.filterProductId = String(productId);
    extra.push('l.product_id = :filterProductId');
  }
  if (providerId) {
    replacements.filterProviderId = String(providerId);
    extra.push('COALESCE(l.provider_id, l.product_id, \'\') = :filterProviderId');
  }
  if (gameId) {
    replacements.filterGameId = parseInt(gameId, 10);
    extra.push('l.game_id = :filterGameId');
  }

  const where = [
    userSql,
    'l.created_at >= :from',
    'l.created_at <= :to',
    ...extra
  ].filter(Boolean).join(' AND ');

  const countRows = await db.sequelize.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(l.amount), 0)::float AS total_amount
     FROM ${activitySourceSql()} l
     JOIN users u ON u.user_id = l.user_id
     LEFT JOIN games g ON g.id = l.game_id
     WHERE ${where}`,
    { replacements, type: QueryTypes.SELECT }
  );
  const total = Number(countRows[0]?.c) || 0;
  const totalAmount = round2(countRows[0]?.total_amount);

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
      l.remarks,
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

  return {
    metric: metric || 'total_in',
    total,
    totalAmount,
    page: paging.page,
    limit: paging.limit,
    rows: rows.map((row) => ({
      ...row,
      amount: round2(row.amount),
      displayName: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null
    }))
  };
}

module.exports = {
  getDailyScReportEntries
};
