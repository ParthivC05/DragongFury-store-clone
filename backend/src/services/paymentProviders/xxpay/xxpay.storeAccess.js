'use strict';

/**
 * XXPay is allowlisted by store code, then still opt-in via store_payment_providers
 * (admin Payment Methods toggles).
 *
 * Base surface (all XXPAY_ALLOWED_STORE_CODES):
 *   deposit: Cash App + Chime + Card (card opt-in / default OFF)
 *   withdraw: Cash App + Chime + PayPal (PayPal opt-in / default OFF)
 * Apple Pay / Google Pay deposit: XXPAY_APPLE_GOOGLE_STORE_CODES only.
 *
 * Keep in sync with partner-platform-admin PaymentProviders.jsx.
 */
const XXPAY_ALLOWED_STORE_CODES = new Set([
  'sweepstakebet',
  'dragonfury',
  'myvepower',
  'goodgdragon',
  'casinoslots',
  'goodwork',
  'winners4'
]);

/** Admin may assign Apple Pay / Google Pay → XXPay (deposit) only for these stores. */
const XXPAY_APPLE_GOOGLE_STORE_CODES = new Set([
  'dragonfury',
  'myvepower',
  'goodgdragon',
  'goodwork'
]);

/** Legacy base keys (missing in store map = ON for backward compat). */
const XXPAY_METHOD_KEYS = new Set(['cashapp', 'chime']);

/** Deposit extras: missing key = OFF (do not steal from Orion/DollarPay). */
const XXPAY_OPT_IN_DEPOSIT_KEYS = new Set(['apple_pay', 'google_pay', 'card']);

/** Withdraw extras: missing key = OFF. */
const XXPAY_OPT_IN_WITHDRAW_KEYS = new Set(['paypal']);

/** @deprecated apple/google-only name; prefer XXPAY_OPT_IN_DEPOSIT_KEYS */
const XXPAY_APPLE_GOOGLE_DEPOSIT_EXTRA_KEYS = new Set(['apple_pay', 'google_pay']);
/** @deprecated */
const XXPAY_DRAGONFURY_DEPOSIT_EXTRA_KEYS = XXPAY_APPLE_GOOGLE_DEPOSIT_EXTRA_KEYS;

function normalizeStoreCode(storeCode) {
  return String(storeCode || '').trim().toLowerCase();
}

function storeAllowsXxpay(storeCode) {
  return XXPAY_ALLOWED_STORE_CODES.has(normalizeStoreCode(storeCode));
}

function storeAllowsXxpayAppleGooglePay(storeCode) {
  return XXPAY_APPLE_GOOGLE_STORE_CODES.has(normalizeStoreCode(storeCode));
}

function isXxpayOptInDepositKey(typeKey) {
  return XXPAY_OPT_IN_DEPOSIT_KEYS.has(String(typeKey || '').trim().toLowerCase());
}

function isXxpayOptInWithdrawKey(typeKey) {
  return XXPAY_OPT_IN_WITHDRAW_KEYS.has(String(typeKey || '').trim().toLowerCase());
}

function isXxpayAppleGoogleDepositExtra(typeKey) {
  return XXPAY_APPLE_GOOGLE_DEPOSIT_EXTRA_KEYS.has(String(typeKey || '').trim().toLowerCase());
}

/** @deprecated use isXxpayOptInDepositKey / isXxpayAppleGoogleDepositExtra */
function isXxpayPlayjuwaDepositExtra(typeKey) {
  return isXxpayOptInDepositKey(typeKey);
}

function getXxpaySupportedDepositTypes(storeCode) {
  const keys = ['cashapp', 'chime', 'card'];
  if (storeAllowsXxpayAppleGooglePay(storeCode)) {
    keys.push('apple_pay', 'google_pay');
  }
  return keys;
}

function getXxpaySupportedWithdrawTypes() {
  return ['cashapp', 'chime', 'paypal'];
}

function getXxpayMethodKeys(storeCode, direction = 'deposit') {
  if (String(direction || '').toLowerCase() === 'withdraw') {
    return new Set(getXxpaySupportedWithdrawTypes());
  }
  return new Set(getXxpaySupportedDepositTypes(storeCode));
}

function isXxpayDepositTypeAllowedForStore(storeCode, paymentType) {
  const key = String(paymentType || '').trim().toLowerCase();
  return getXxpaySupportedDepositTypes(storeCode).includes(key);
}

/**
 * Master + store method maps for XXPay deposit.
 * Cash App / Chime: missing key = ON (legacy).
 * Card / Apple Pay / Google Pay: missing key = OFF.
 */
function isXxpayDepositMethodEnabledInMaps(storeCode, typeKey, masterMap, storeMap) {
  const key = String(typeKey || '').trim().toLowerCase();
  if (!isXxpayDepositTypeAllowedForStore(storeCode, key)) return false;
  if (masterMap && typeof masterMap === 'object' && !Array.isArray(masterMap) && masterMap[key] === false) {
    return false;
  }
  if (isXxpayOptInDepositKey(key)) {
    return storeMap && typeof storeMap === 'object' && storeMap[key] === true;
  }
  if (!storeMap || typeof storeMap !== 'object' || Array.isArray(storeMap)) return true;
  return storeMap[key] !== false;
}

/**
 * Master + store method maps for XXPay withdraw.
 * Cash App / Chime: missing key = ON.
 * PayPal: missing key = OFF.
 */
function isXxpayWithdrawMethodEnabledInMaps(typeKey, masterMap, storeMap) {
  const key = String(typeKey || '').trim().toLowerCase();
  if (!getXxpaySupportedWithdrawTypes().includes(key)) return false;
  if (masterMap && typeof masterMap === 'object' && !Array.isArray(masterMap) && masterMap[key] === false) {
    return false;
  }
  if (isXxpayOptInWithdrawKey(key)) {
    return storeMap && typeof storeMap === 'object' && storeMap[key] === true;
  }
  if (!storeMap || typeof storeMap !== 'object' || Array.isArray(storeMap)) return true;
  return storeMap[key] !== false;
}

/**
 * Keep only allowed XXPay keys for this store/direction.
 * Opt-in keys default false so missing ≠ all ON.
 */
function sanitizeXxpayMethodsMap(methodsEnabled, opts = {}) {
  if (methodsEnabled == null || typeof methodsEnabled !== 'object' || Array.isArray(methodsEnabled)) {
    return methodsEnabled;
  }
  const direction = String(opts.direction || 'deposit').toLowerCase() === 'withdraw' ? 'withdraw' : 'deposit';
  const allowed = getXxpayMethodKeys(opts.storeCode, direction);
  const out = {};
  for (const key of Object.keys(methodsEnabled)) {
    const k = String(key || '').trim().toLowerCase();
    if (!allowed.has(k)) continue;
    out[k] = methodsEnabled[key] === true;
  }
  for (const k of allowed) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) {
      out[k] = false;
    }
  }
  return out;
}

module.exports = {
  XXPAY_ALLOWED_STORE_CODES,
  XXPAY_APPLE_GOOGLE_STORE_CODES,
  XXPAY_METHOD_KEYS,
  XXPAY_OPT_IN_DEPOSIT_KEYS,
  XXPAY_OPT_IN_WITHDRAW_KEYS,
  XXPAY_APPLE_GOOGLE_DEPOSIT_EXTRA_KEYS,
  XXPAY_DRAGONFURY_DEPOSIT_EXTRA_KEYS,
  storeAllowsXxpay,
  storeAllowsXxpayAppleGooglePay,
  isXxpayOptInDepositKey,
  isXxpayOptInWithdrawKey,
  isXxpayAppleGoogleDepositExtra,
  isXxpayPlayjuwaDepositExtra,
  getXxpaySupportedDepositTypes,
  getXxpaySupportedWithdrawTypes,
  getXxpayMethodKeys,
  isXxpayDepositTypeAllowedForStore,
  isXxpayDepositMethodEnabledInMaps,
  isXxpayWithdrawMethodEnabledInMaps,
  sanitizeXxpayMethodsMap
};
