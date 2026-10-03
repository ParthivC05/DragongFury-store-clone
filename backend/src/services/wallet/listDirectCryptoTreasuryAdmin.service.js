'use strict';

const db = require('../../db/models');
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { hasMnemonic } = require('../paymentProviders/selfcrypto/selfcrypto.config');
const { treasuryAddresses, treasuryConfigured } = require('../paymentProviders/selfcrypto/selfcrypto.treasury');
const { buildDateTimeRangeFilterParts } = require('../../utils/dateRangeFilters');
const { stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');
const {
  normalizeCurrency,
  normalizeStatus,
  explorerLinks,
  rowNetworkLabel,
  ONCHAIN_METHODS
} = require('./directCryptoTreasury.helpers');
const {
  fetchTreasuryBalance,
  usdValue,
  loadUsdRatesSafe
} = require('./directCryptoBalances.helpers');

function buildScopeSql(req, query, replacements) {
  const clauses = [];
  if (req.role === ROLES.STORE_ADMIN) {
    clauses.push('u.store_code = :scopedStoreCode');
    replacements.scopedStoreCode = req.storeCode || '';
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    clauses.push('u.distributor_code = :scopedDistributorCode');
    replacements.scopedDistributorCode = req.distributorCode || '';
    const scDist = query.storeCode && String(query.storeCode).trim();
    if (scDist) {
      clauses.push('u.store_code = :filterStoreCodeDist');
      replacements.filterStoreCodeDist = scDist;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    const sc = query.storeCode && String(query.storeCode).trim();
    const dc = query.distributorCode && String(query.distributorCode).trim();
    if (sc) {
      clauses.push('u.store_code = :filterStoreCode');
      replacements.filterStoreCode = sc;
    }
    if (dc) {
      clauses.push('u.distributor_code = :filterDistributorCode');
      replacements.filterDistributorCode = dc;
    }
  }
  return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
}

function buildFilters(query, replacements, { includeStatus = true, includeCurrency = true } = {}) {
  const parts = [
    `LOWER(COALESCE(ppd.provider, '')) = 'selfcrypto'`,
    `LOWER(COALESCE(ppd.payment_method, '')) IN (${ONCHAIN_METHODS.map((m) => `'${m}'`).join(', ')})`
  ];

  if (includeCurrency) {
    const currency = normalizeCurrency(query.currency);
    if (currency) {
      parts.push('UPPER(COALESCE(ppd.target_currency, \'\')) = :filterCurrency');
      replacements.filterCurrency = currency;
    }
  }

  if (includeStatus && query.status && String(query.status).trim()) {
    const s = normalizeStatus(query.status);
    if (s === 'completed') {
      parts.push(`LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success')`);
    } else if (s === 'pending') {
      parts.push(`LOWER(COALESCE(ppd.status, '')) IN ('pending', 'processing')`);
    } else if (s === 'confirming') {
      parts.push(`LOWER(COALESCE(ppd.status, '')) = 'confirming'`);
    } else if (s === 'expired') {
      parts.push(`LOWER(COALESCE(ppd.status, '')) = 'expired'`);
    } else if (s === 'failed') {
      parts.push(`LOWER(COALESCE(ppd.status, '')) IN ('failed', 'rejected')`);
    }
  }

  const uid = parseInt(query.userId, 10);
  if (Number.isFinite(uid) && uid > 0) {
    parts.push('ppd.user_id = :filterUserId');
    replacements.filterUserId = uid;
  }

  parts.push(...buildDateTimeRangeFilterParts(query, replacements, 'ppd.created_at', 'dct'));
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

function mapRow(row, rates) {
  const currency = normalizeCurrency(row.target_currency) || String(row.target_currency || '').toUpperCase();
  const status = normalizeStatus(row.status);
  const txHash = row.tx_hash || (row.provider_metadata && row.provider_metadata.txHash) || null;
  const links = explorerLinks(currency, row.wallet_address, txHash);
  const meta = row.provider_metadata && typeof row.provider_metadata === 'object' ? row.provider_metadata : {};
  const cryptoAmount = row.target_amount != null ? Number(row.target_amount) : null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username || null,
    email: row.email || null,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    storeCode: row.store_code || null,
    distributorCode: row.distributor_code || null,
    scAmount: row.sc_amount != null ? Number(row.sc_amount) : null,
    cryptoAmount,
    cryptoUsd: usdValue(cryptoAmount, currency, rates),
    currency,
    paymentMethod: row.payment_method || null,
    networkLabel: rowNetworkLabel(row.payment_method, currency),
    walletAddress: row.wallet_address || null,
    status,
    createdAt: row.created_at,
    providerSessionId: row.provider_session_id || null,
    txHash: txHash || null,
    fromAddress: meta.fromAddress || null,
    centralWallet: meta.treasury === true,
    derivationIndex: meta.derivationIndex != null ? Number(meta.derivationIndex) : null,
    chain: meta.chain || null,
    explorerAddressUrl: links.addressUrl,
    explorerTxUrl: links.txUrl
  };
}

function emptyPayload() {
  return {
    configured: treasuryConfigured() || hasMnemonic(),
    title: 'Crypto wallet',
    receiveAddresses: [],
    list: [],
    total: 0,
    page: 1,
    limit: 20,
    totalsByCurrency: [],
    statusCounts: { pending: 0, confirming: 0, completed: 0, expired: 0, failed: 0 },
    usdRates: {},
    uniqueAddresses: 0,
    walletUsdTotal: null
  };
}

/**
 * Crypto wallet admin view: one receive address per coin, live balances + USD, deposit ledger.
 */
async function listDirectCryptoTreasuryAdmin(req, query = {}) {
  if (req.role === ROLES.STORE_ADMIN && !req.storeCode) return emptyPayload();
  if (req.role === ROLES.DISTRIBUTOR_ADMIN && !req.distributorCode) return emptyPayload();

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const replacements = { limit, offset };
  const scopeSql = buildScopeSql(req, query, replacements);
  const filterSql = buildFilters(query, replacements, { includeStatus: true, includeCurrency: true });
  const overviewReplacements = { ...replacements };
  delete overviewReplacements.limit;
  delete overviewReplacements.offset;
  const overviewFilterSql = buildFilters(query, overviewReplacements, {
    includeStatus: false,
    includeCurrency: false
  });
  const skipBalances = String(query.refreshBalances || '').toLowerCase() === 'false'
    || String(query.refreshBalances || '') === '0';

  const baseFrom = `
    FROM payment_pending_deposits ppd
    INNER JOIN users u ON u.user_id = ppd.user_id
    LEFT JOIN deposit_requests dr ON dr.provider = 'selfcrypto'
      AND dr.provider_transaction_id = ppd.provider_session_id
    WHERE 1 = 1
    ${scopeSql}
    ${filterSql}
  `;

  const overviewFrom = `
    FROM payment_pending_deposits ppd
    INNER JOIN users u ON u.user_id = ppd.user_id
    WHERE 1 = 1
    ${scopeSql}
    ${overviewFilterSql}
  `;

  const rates = await loadUsdRatesSafe();

  const [countRow, totalsByCurrency, statusRows, uniqueRow, rows] = await Promise.all([
    db.sequelize.query(`SELECT COUNT(*)::int AS count ${baseFrom}`, {
      replacements,
      type: QueryTypes.SELECT
    }),
    db.sequelize.query(
      `SELECT
        UPPER(COALESCE(ppd.target_currency, '')) AS currency,
        COUNT(*)::int AS deposit_count,
        COALESCE(SUM(ppd.target_amount::numeric), 0) AS crypto_total,
        COALESCE(SUM(ppd.amount::numeric), 0) AS sc_total
      ${overviewFrom}
        AND LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success')
      GROUP BY UPPER(COALESCE(ppd.target_currency, ''))
      ORDER BY currency ASC`,
      { replacements: overviewReplacements, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `SELECT
        CASE
          WHEN LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success') THEN 'completed'
          WHEN LOWER(COALESCE(ppd.status, '')) IN ('pending', 'processing') THEN 'pending'
          WHEN LOWER(COALESCE(ppd.status, '')) = 'confirming' THEN 'confirming'
          WHEN LOWER(COALESCE(ppd.status, '')) = 'expired' THEN 'expired'
          WHEN LOWER(COALESCE(ppd.status, '')) IN ('failed', 'rejected') THEN 'failed'
          ELSE 'other'
        END AS status_key,
        COUNT(*)::int AS count
      ${overviewFrom}
      GROUP BY 1`,
      { replacements: overviewReplacements, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `SELECT COUNT(DISTINCT ppd.wallet_address)::int AS count
      ${overviewFrom}
        AND ppd.wallet_address IS NOT NULL
        AND TRIM(ppd.wallet_address) <> ''
        AND LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success')`,
      { replacements: overviewReplacements, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `SELECT
        ppd.id,
        ppd.user_id,
        ppd.amount::numeric AS sc_amount,
        ppd.target_amount::numeric,
        ppd.target_currency,
        ppd.payment_method,
        ppd.wallet_address,
        ppd.status,
        ppd.provider_session_id,
        ppd.provider_metadata,
        ppd.created_at,
        dr.tx_hash,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.store_code,
        u.distributor_code
      ${baseFrom}
      ORDER BY ppd.created_at DESC
      LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    )
  ]);

  const addresses = treasuryAddresses();
  const receiveAddresses = [
    { currency: 'BTC', chain: 'btc', name: 'Bitcoin', address: addresses.btc },
    { currency: 'ETH', chain: 'eth', name: 'Ethereum', address: addresses.eth },
    { currency: 'TRX', chain: 'trx', name: 'Tron', address: addresses.trx },
    { currency: 'SOL', chain: 'sol', name: 'Solana', address: addresses.sol }
  ].map((item) => ({
    ...item,
    balance: null,
    balanceUsd: null,
    usdRate: rates[item.currency] != null ? Number(rates[item.currency]) : null,
    explorerAddressUrl: item.address ? explorerLinks(item.currency, item.address, null).addressUrl : null
  }));

  if (!skipBalances) {
    await Promise.all(receiveAddresses.map(async (item) => {
      if (!item.address) return;
      item.balance = await fetchTreasuryBalance(item.chain, item.address);
      item.balanceUsd = usdValue(item.balance, item.currency, rates);
    }));
  }

  const totals = totalsByCurrency.map((t) => {
    const currency = String(t.currency || '').toUpperCase();
    const cryptoTotal = Number(t.crypto_total);
    return {
      currency,
      depositCount: t.deposit_count,
      cryptoTotal,
      cryptoUsd: usdValue(cryptoTotal, currency, rates),
      scTotal: Number(t.sc_total),
      usdRate: rates[currency] != null ? Number(rates[currency]) : null
    };
  });

  const statusCounts = { pending: 0, confirming: 0, completed: 0, expired: 0, failed: 0, other: 0 };
  for (const row of statusRows) {
    const key = row.status_key;
    if (Object.prototype.hasOwnProperty.call(statusCounts, key)) {
      statusCounts[key] = row.count;
    }
  }

  const walletUsdTotal = receiveAddresses.reduce((sum, item) => {
    if (item.balanceUsd == null) return sum;
    return (sum == null ? 0 : sum) + item.balanceUsd;
  }, null);

  let list = rows.map((row) => mapRow(row, rates));
  list = list.map((row) => stripPlayerEmailFields(row, req.role));

  return {
    configured: treasuryConfigured() || hasMnemonic(),
    title: 'Crypto wallet',
    receiveAddresses,
    list,
    total: countRow[0]?.count || 0,
    page,
    limit,
    totalsByCurrency: totals,
    statusCounts,
    usdRates: rates,
    uniqueAddresses: uniqueRow[0]?.count || 0,
    walletUsdTotal,
    balancesLoaded: !skipBalances,
    withdrawGuide: {
      summary: 'Each coin has one receive address. Player payments land there. This page shows balances, USD value, and which player was credited SC.',
      steps: [
        'Balances above are the live amount on each receive address.',
        'Open deposits stay pending or confirming until the chain confirms the exact transfer.',
        'Completed means SC was credited to the player wallet.',
        'Lightning is separate and does not use these MetaMask addresses.'
      ],
      note: 'MetaMask shows transfers only. Player name and SC credit status are on this page.'
    }
  };
}

module.exports = { listDirectCryptoTreasuryAdmin };
