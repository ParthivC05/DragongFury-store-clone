'use strict';

const GC_CURRENCY_CODE = 'GC';
const GC_COINS_STORE_CODE = 'dragonfury';

function normalizeStoreCode(storeCode) {
  return String(storeCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isGcCoinsStore(storeCode) {
  return normalizeStoreCode(storeCode) === GC_COINS_STORE_CODE;
}

/** Gold Coins can be wagered only on 1GameHub titles. */
function isGcPlayProvider(provider) {
  const raw = String(provider || '')
    .trim()
    .toLowerCase();
  return raw === 'onegamehub' || raw === '1gamehub';
}

module.exports = {
  GC_CURRENCY_CODE,
  GC_COINS_STORE_CODE,
  normalizeStoreCode,
  isGcCoinsStore,
  isGcPlayProvider
};
