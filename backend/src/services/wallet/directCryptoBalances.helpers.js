'use strict';

const axios = require('axios');
const {
  btcApiBase,
  ethRpcUrl,
  tronApiBase,
  solRpcUrl
} = require('../paymentProviders/selfcrypto/selfcrypto.config');
const { getUsdRates } = require('../paymentProviders/selfcrypto/selfcrypto.prices');

const TIMEOUT = { timeout: 8000 };
const BTC_FALLBACKS = ['https://mempool.space/api', 'https://blockstream.info/api'];

function uniqueBases(preferred) {
  return [...new Set([preferred, ...BTC_FALLBACKS].filter(Boolean).map((u) => String(u).replace(/\/+$/, '')))];
}

async function balanceBtc(address) {
  let lastErr = null;
  for (const base of uniqueBases(btcApiBase())) {
    try {
      const { data } = await axios.get(`${base}/address/${encodeURIComponent(address)}`, TIMEOUT);
      const confirmed = Number(data?.chain_stats?.funded_txo_sum || 0) - Number(data?.chain_stats?.spent_txo_sum || 0);
      const mempool = Number(data?.mempool_stats?.funded_txo_sum || 0) - Number(data?.mempool_stats?.spent_txo_sum || 0);
      const sats = Math.max(0, confirmed) + Math.max(0, mempool);
      return sats / 1e8;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function balanceEth(address) {
  const rpc = ethRpcUrl();
  if (!rpc) return null;
  const { data } = await axios.post(rpc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [address, 'latest']
  }, TIMEOUT);
  const wei = BigInt(data?.result || '0x0');
  const text = wei.toString().padStart(19, '0');
  const whole = text.slice(0, -18) || '0';
  const frac = text.slice(-18).replace(/0+$/, '');
  return Number(frac ? `${whole}.${frac}` : whole);
}

async function balanceTrx(address) {
  const { data } = await axios.get(`${tronApiBase()}/v1/accounts/${encodeURIComponent(address)}`, TIMEOUT);
  const account = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
  return Number(account?.balance || 0) / 1e6;
}

async function balanceSol(address) {
  const { data } = await axios.post(solRpcUrl(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [address, { commitment: 'confirmed' }]
  }, TIMEOUT);
  return Number(data?.result?.value ?? 0) / 1e9;
}

async function fetchTreasuryBalance(chain, address) {
  if (!address) return null;
  try {
    if (chain === 'btc') return await balanceBtc(address);
    if (chain === 'eth') return await balanceEth(address);
    if (chain === 'trx') return await balanceTrx(address);
    if (chain === 'sol') return await balanceSol(address);
  } catch (_) {
    return null;
  }
  return null;
}

function usdValue(amount, currency, rates) {
  const n = Number(amount);
  const rate = Number(rates?.[String(currency || '').toUpperCase()]);
  if (!Number.isFinite(n) || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(n * rate * 100) / 100;
}

async function loadUsdRatesSafe() {
  try {
    return await getUsdRates();
  } catch (_) {
    return {};
  }
}

module.exports = {
  fetchTreasuryBalance,
  usdValue,
  loadUsdRatesSafe
};
