'use strict';

/**
 * Per-store toggles for crypto coins / networks.
 * Stored on store_payment_providers.deposit_methods_enabled next to the `crypto` rail flag.
 * Missing key = enabled (same as other payment-type maps).
 */
const CRYPTO_DEPOSIT_RAILS = {
  selfcrypto: [
    { key: 'btc_onchain', label: 'Bitcoin (on-chain)', currency: 'BTC', paymentMethod: 'onchain' },
    { key: 'btc_lightning', label: 'Lightning', currency: 'BTC', paymentMethod: 'lightning' },
    { key: 'eth', label: 'Ethereum', currency: 'ETH', paymentMethod: 'ethereum' },
    { key: 'trx', label: 'Tron', currency: 'TRX', paymentMethod: 'tron' },
    { key: 'sol', label: 'Solana', currency: 'SOL', paymentMethod: 'solana' }
  ],
  scrypto: [
    { key: 'sats_onchain', label: 'Bitcoin (on-chain)', currency: 'SATS', paymentMethod: 'onchain' },
    { key: 'sats_lightning', label: 'Lightning', currency: 'SATS', paymentMethod: 'lightning' },
    { key: 'usdt', label: 'USDT', currency: 'USDT', paymentMethod: null },
    { key: 'usdc', label: 'USDC', currency: 'USDC', paymentMethod: null }
  ]
};

function cryptoRailKeys(providerCode) {
  const code = String(providerCode || '').toLowerCase();
  return (CRYPTO_DEPOSIT_RAILS[code] || []).map((r) => r.key);
}

function isCryptoRailEnabled(masterMap, storeMap, key) {
  if (masterMap && masterMap[key] === false) return false;
  if (storeMap && storeMap[key] === false) return false;
  return true;
}

/**
 * Drop coins/networks that the store (or master) turned off.
 * @param {string} providerCode
 * @param {Record<string, string[]>} baseMap paymentMethodsByTargetCurrency
 */
function filterCryptoMethods(providerCode, baseMap, masterMap, storeMap) {
  const code = String(providerCode || '').toLowerCase();
  const rails = CRYPTO_DEPOSIT_RAILS[code] || [];
  const source = baseMap && typeof baseMap === 'object' ? baseMap : {};
  const out = {};
  for (const rail of rails) {
    if (!isCryptoRailEnabled(masterMap, storeMap, rail.key)) continue;
    const methods = Array.isArray(source[rail.currency]) ? source[rail.currency] : [];
    if (rail.paymentMethod) {
      if (!methods.includes(rail.paymentMethod)) continue;
      if (!out[rail.currency]) out[rail.currency] = [];
      if (!out[rail.currency].includes(rail.paymentMethod)) out[rail.currency].push(rail.paymentMethod);
    } else if (methods.length) {
      out[rail.currency] = methods.slice();
    }
  }
  return out;
}

function isCryptoOptionAllowed(providerCode, currency, paymentMethod, masterMap, storeMap) {
  const code = String(providerCode || '').toLowerCase();
  const tc = String(currency || '').trim().toUpperCase();
  const pm = String(paymentMethod || '').trim().toLowerCase();
  const rails = CRYPTO_DEPOSIT_RAILS[code] || [];
  if (!rails.length) return true;
  const match = rails.find((r) => r.currency === tc && (!r.paymentMethod || r.paymentMethod === pm));
  if (!match) return false;
  return isCryptoRailEnabled(masterMap, storeMap, match.key);
}

function cryptoRailsState(providerCode, mergedDeposit) {
  const code = String(providerCode || '').toLowerCase();
  return (CRYPTO_DEPOSIT_RAILS[code] || []).map((r) => ({
    key: r.key,
    label: r.label,
    enabled: !mergedDeposit || mergedDeposit[r.key] !== false
  }));
}

module.exports = {
  CRYPTO_DEPOSIT_RAILS,
  cryptoRailKeys,
  isCryptoRailEnabled,
  filterCryptoMethods,
  isCryptoOptionAllowed,
  cryptoRailsState
};
