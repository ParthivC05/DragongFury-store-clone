'use strict';

const axios = require('axios');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../../constants/httpTimeouts');
const { paymentErrorLog } = require('../../../libs/logger');

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  TRX: 'tron',
  SOL: 'solana'
};

const COINBASE_IDS = {
  BTC: 'BTC',
  ETH: 'ETH',
  TRX: 'TRX',
  SOL: 'SOL'
};

let cache = { at: 0, rates: null };
const CACHE_MS = 30 * 1000;

function roundDown(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const f = 10 ** decimals;
  return Math.floor(n * f + 1e-12) / f;
}

async function fetchCoinGecko() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: { ids, vs_currencies: 'usd' },
    timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
  });
  const rates = {};
  for (const [code, id] of Object.entries(COINGECKO_IDS)) {
    const usd = Number(data?.[id]?.usd);
    if (Number.isFinite(usd) && usd > 0) rates[code] = usd;
  }
  if (Object.keys(rates).length < 4) throw new Error('CoinGecko missing rates');
  return rates;
}

async function fetchCoinbase() {
  const rates = {};
  await Promise.all(Object.entries(COINBASE_IDS).map(async ([code, id]) => {
    const { data } = await axios.get(`https://api.coinbase.com/v2/prices/${id}-USD/spot`, {
      timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
    });
    const usd = Number(data?.data?.amount);
    if (Number.isFinite(usd) && usd > 0) rates[code] = usd;
  }));
  if (Object.keys(rates).length < 4) throw new Error('Coinbase missing rates');
  return rates;
}

async function getUsdRates() {
  if (cache.rates && Date.now() - cache.at < CACHE_MS) return cache.rates;
  try {
    const rates = await fetchCoinGecko();
    cache = { at: Date.now(), rates };
    return rates;
  } catch (err) {
    paymentErrorLog('selfcrypto prices CoinGecko failed', err.message);
    const rates = await fetchCoinbase();
    cache = { at: Date.now(), rates };
    return rates;
  }
}

async function usdToCrypto(usdAmount, assetCode, decimals) {
  const rates = await getUsdRates();
  const code = String(assetCode || '').toUpperCase();
  const usdPerCoin = rates[code];
  if (!Number.isFinite(usdPerCoin) || usdPerCoin <= 0) {
    const err = new Error(`No USD rate for ${code}`);
    err.statusCode = 503;
    throw err;
  }
  const amount = roundDown(Number(usdAmount) / usdPerCoin, decimals);
  if (!(amount > 0)) {
    const err = new Error(`Amount too small for ${code}`);
    err.statusCode = 400;
    throw err;
  }
  return { cryptoAmount: amount, usdRate: usdPerCoin };
}

function toBaseUnits(amount, decimals) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  const [whole, frac = ''] = n.toFixed(decimals).split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(padded || '0');
}

module.exports = {
  getUsdRates,
  usdToCrypto,
  roundDown,
  toBaseUnits
};
