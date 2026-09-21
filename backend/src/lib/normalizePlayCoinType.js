'use strict';

const { isGcPlayProvider } = require('../constants/gcCoins');

/**
 * Resolve play-game coin from query/body (GC vs SC).
 * DragonFury default is SC (unlike Orionstars, which defaults to GC).
 * GC is accepted only for 1GameHub; every other provider is SC.
 */
function normalizePlayCoinType(input) {
  const value = Array.isArray(input) ? input[0] : input;
  if (value == null || value === '') return 'SC';

  const raw = String(value).trim().toUpperCase();

  if (raw === 'GC' || raw === 'GOC' || raw === 'GOLD') return 'GC';
  if (raw === 'SC' || raw === 'SSC' || raw === 'SWEEP' || raw === 'SWEEPS' || raw === 'SILVER') {
    return 'SC';
  }

  return 'SC';
}

function isGcCoin(coinType) {
  return normalizePlayCoinType(coinType) === 'GC';
}

function hubCurrencyForCoin(coin) {
  return normalizePlayCoinType(coin) === 'GC' ? 'GOC' : 'SSC';
}

function coinFromHubCurrency(currency) {
  const raw = String(currency || '').trim().toUpperCase();
  return raw === 'GOC' || raw === 'GC' ? 'GC' : 'SC';
}

function parseCoinTypeFromReq(req, provider) {
  if (!isGcPlayProvider(provider)) return 'SC';
  const body = req?.body || {};
  const query = req?.query || {};
  return normalizePlayCoinType(
    body.coinType ?? body.coin_type ?? body.coin ?? query.coinType ?? query.coin_type
  );
}

module.exports = {
  normalizePlayCoinType,
  isGcCoin,
  hubCurrencyForCoin,
  coinFromHubCurrency,
  parseCoinTypeFromReq
};
