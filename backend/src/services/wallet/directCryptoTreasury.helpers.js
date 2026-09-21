'use strict';

const { networkLabelFor } = require('../paymentProviders/selfcrypto/selfcrypto.config');

const EXPLORERS = {
  BTC: {
    address: (a) => `https://mempool.space/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://mempool.space/tx/${encodeURIComponent(h)}`
  },
  ETH: {
    address: (a) => `https://etherscan.io/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://etherscan.io/tx/${encodeURIComponent(h)}`
  },
  TRX: {
    address: (a) => `https://tronscan.org/#/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://tronscan.org/#/transaction/${encodeURIComponent(h)}`
  },
  SOL: {
    address: (a) => `https://solscan.io/account/${encodeURIComponent(a)}`,
    tx: (h) => `https://solscan.io/tx/${encodeURIComponent(h)}`
  }
};

function normalizeCurrency(raw) {
  const c = String(raw || '').trim().toUpperCase();
  return EXPLORERS[c] ? c : null;
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'completed' || s === 'success') return 'completed';
  if (s === 'confirming' || s === 'processing') return 'confirming';
  if (s === 'pending') return 'pending';
  if (s === 'expired') return 'expired';
  if (s === 'failed' || s === 'rejected') return 'failed';
  return s || 'pending';
}

function explorerLinks(currency, address, txHash) {
  const code = normalizeCurrency(currency);
  if (!code) return { addressUrl: null, txUrl: null };
  const ex = EXPLORERS[code];
  return {
    addressUrl: address ? ex.address(address) : null,
    txUrl: txHash ? ex.tx(txHash) : null
  };
}

function rowNetworkLabel(paymentMethod, targetCurrency) {
  return networkLabelFor(paymentMethod, targetCurrency);
}

module.exports = {
  normalizeCurrency,
  normalizeStatus,
  explorerLinks,
  rowNetworkLabel,
  ONCHAIN_METHODS: ['onchain', 'ethereum', 'tron', 'solana']
};
