'use strict';

const db = require('../../db/models');
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { hasMnemonic } = require('../paymentProviders/selfcrypto/selfcrypto.config');
const {
  checkBitcoin,
  checkEthereum,
  checkTron,
  checkSolana
} = require('../paymentProviders/selfcrypto/selfcrypto.watchers');
const { buildDateTimeRangeFilterParts } = require('../../utils/dateRangeFilters');
const { stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');
const {
  normalizeCurrency,
  normalizeStatus,
  explorerLinks,
  rowNetworkLabel,
  ONCHAIN_METHODS
} = require('./directCryptoTreasury.helpers');

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

function buildFilters(query, replacements) {
  const parts = [
    `LOWER(COALESCE(ppd.provider, '')) = 'selfcrypto'`,
    `LOWER(COALESCE(ppd.payment_method, '')) IN (${ONCHAIN_METHODS.map((m) => `'${m}'`).join(', ')})`
  ];

  const currency = normalizeCurrency(query.currency);
  if (currency) {
    parts.push('UPPER(COALESCE(ppd.target_currency, \'\')) = :filterCurrency');
    replacements.filterCurrency = currency;
  }

  if (query.status && String(query.status).trim()) {
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

async function fetchOnChainBalance(row) {
  const address = row.wallet_address;
  const method = String(row.payment_method || '').toLowerCase();
  const expected = Number(row.target_amount);
  if (!address) return null;
  try {
    if (method === 'onchain') {
      const r = await checkBitcoin({ address, expectedAmount: expected > 0 ? expected : 0.00000001 });
      return r.received != null ? Number(r.received) : null;
    }
    if (method === 'ethereum') {
      const r = await checkEthereum({ address, expectedAmount: expected > 0 ? expected : 0.00000001, minConfirmations: 1 });
      return r.received != null ? Number(r.received) : null;
    }
    if (method === 'tron') {
      const r = await checkTron({ address, expectedAmount: expected > 0 ? expected : 0.00000001, minConfirmations: 1 });
      return r.received != null ? Number(r.received) : null;
    }
    if (method === 'solana') {
      const r = await checkSolana({ address, expectedAmount: expected > 0 ? expected : 0.00000001 });
      return r.received != null ? Number(r.received) : null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function mapRow(row) {
  const currency = normalizeCurrency(row.target_currency) || String(row.target_currency || '').toUpperCase();
  const status = normalizeStatus(row.status);
  const links = explorerLinks(currency, row.wallet_address, row.tx_hash);
  const meta = row.provider_metadata && typeof row.provider_metadata === 'object' ? row.provider_metadata : {};
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
    cryptoAmount: row.target_amount != null ? Number(row.target_amount) : null,
    currency,
    paymentMethod: row.payment_method || null,
    networkLabel: rowNetworkLabel(row.payment_method, currency),
    walletAddress: row.wallet_address || null,
    status,
    createdAt: row.created_at,
    providerSessionId: row.provider_session_id || null,
    txHash: row.tx_hash || null,
    derivationIndex: meta.derivationIndex != null ? Number(meta.derivationIndex) : null,
    chain: meta.chain || null,
    explorerAddressUrl: links.addressUrl,
    explorerTxUrl: links.txUrl,
    onChainBalance: null
  };
}

/**
 * Direct Crypto on-chain treasury view for admin (BTC / ETH / TRX / SOL — not Lightning).
 */
async function listDirectCryptoTreasuryAdmin(req, query = {}) {
  if (req.role === ROLES.STORE_ADMIN && !req.storeCode) {
    return {
      configured: hasMnemonic(),
      list: [],
      total: 0,
      page: 1,
      limit: 20,
      totalsByCurrency: [],
      uniqueAddresses: 0
    };
  }
  if (req.role === ROLES.DISTRIBUTOR_ADMIN && !req.distributorCode) {
    return {
      configured: hasMnemonic(),
      list: [],
      total: 0,
      page: 1,
      limit: 20,
      totalsByCurrency: [],
      uniqueAddresses: 0
    };
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const replacements = { limit, offset };
  const scopeSql = buildScopeSql(req, query, replacements);
  const filterSql = buildFilters(query, replacements);
  const refreshBalances = String(query.refreshBalances || '').toLowerCase() === 'true'
    || String(query.refreshBalances || '') === '1';

  const baseFrom = `
    FROM payment_pending_deposits ppd
    INNER JOIN users u ON u.user_id = ppd.user_id
    LEFT JOIN deposit_requests dr ON dr.provider = 'selfcrypto'
      AND dr.provider_transaction_id = ppd.provider_session_id
    WHERE 1 = 1
    ${scopeSql}
    ${filterSql}
  `;

  const countRow = await db.sequelize.query(
    `SELECT COUNT(*)::int AS count ${baseFrom}`,
    { replacements, type: QueryTypes.SELECT }
  );
  const total = countRow[0]?.count || 0;

  const totalsByCurrency = await db.sequelize.query(
    `SELECT
      UPPER(COALESCE(ppd.target_currency, '')) AS currency,
      COUNT(*)::int AS deposit_count,
      COALESCE(SUM(ppd.target_amount::numeric), 0) AS crypto_total,
      COALESCE(SUM(ppd.amount::numeric), 0) AS sc_total
    ${baseFrom}
      AND LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success')
    GROUP BY UPPER(COALESCE(ppd.target_currency, ''))
    ORDER BY currency ASC`,
    { replacements, type: QueryTypes.SELECT }
  );

  const uniqueRow = await db.sequelize.query(
    `SELECT COUNT(DISTINCT ppd.wallet_address)::int AS count
    ${baseFrom}
      AND ppd.wallet_address IS NOT NULL
      AND TRIM(ppd.wallet_address) <> ''
      AND LOWER(COALESCE(ppd.status, '')) IN ('completed', 'success')`,
    { replacements, type: QueryTypes.SELECT }
  );

  const rows = await db.sequelize.query(
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
  );

  let list = rows.map(mapRow);
  if (refreshBalances) {
    const toCheck = list.filter((r) => r.walletAddress && r.status === 'completed').slice(0, 40);
    await Promise.all(toCheck.map(async (item) => {
      const raw = rows.find((r) => r.id === item.id);
      if (!raw) return;
      const bal = await fetchOnChainBalance(raw);
      item.onChainBalance = bal;
    }));
  }

  list = list.map((row) => stripPlayerEmailFields(row, req.role));

  return {
    configured: hasMnemonic(),
    list,
    total,
    page,
    limit,
    totalsByCurrency: totalsByCurrency.map((t) => ({
      currency: t.currency,
      depositCount: t.deposit_count,
      cryptoTotal: Number(t.crypto_total),
      scTotal: Number(t.sc_total)
    })),
    uniqueAddresses: uniqueRow[0]?.count || 0,
    withdrawGuide: {
      summary: 'Crypto stays on each deposit address until you move it. The site does not auto-send to your bank or exchange.',
      steps: [
        'Use the receive address in the table (or open it on the block explorer).',
        'Import the company Direct Crypto seed (SELFCRYPTO_MNEMONIC) into a wallet that supports the coin, or sweep from that address.',
        'Send funds to your exchange or cold wallet, then sell or hold there.',
        'Player SC in the database is separate — crediting a player does not move this crypto.'
      ],
      note: 'Each deposit uses a unique address. You may need to sweep multiple addresses to collect everything.'
    }
  };
}

module.exports = { listDirectCryptoTreasuryAdmin };
