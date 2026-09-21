'use strict';

/**
 * Payment type keys and labels for deposit/withdraw UX.
 * Admin enables/disables each type per provider.
 * `card` = Credit/Debit Card (Orionstars Pay or DollarPayWallet).
 * credit_card / debit_card labels kept for older deposit history rows.
 */
const PAYMENT_TYPE_LABELS = {
  card: 'Credit/Debit Card',
  credit_card: 'Credit/Debit Card',
  debit_card: 'Credit/Debit Card',
  cashapp: 'Cash App',
  chime: 'Chime',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  paypal: 'PayPal',
  venmo: 'Venmo',
  zelle: 'Zelle',
  crypto: 'Crypto',
  bank_transfer: 'Bank transfer (ACH)',
};

/** All known payment type keys (order for display). */
const PAYMENT_TYPE_KEYS = [
  'card',
  'cashapp',
  'chime',
  'apple_pay',
  'google_pay',
  'paypal',
  'venmo',
  'zelle',
  'crypto',
  'bank_transfer',
];

function getPaymentTypeLabel(key) {
  return PAYMENT_TYPE_LABELS[key] || (key ? String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
}

/** Check if a method is enabled from JSON map. Null/undefined/missing key = enabled (backward compat). */
function isMethodEnabledInMap(methodsEnabled, key) {
  if (!methodsEnabled || typeof methodsEnabled !== 'object') return true;
  if (methodsEnabled[key] === false) return false;
  return true;
}

/** Orionstars Pay accepted_payment_options value for a deposit payment type. */
function paymentTypeToOrionAcceptedOption(paymentType) {
  const k = (paymentType || '').toString().trim().toLowerCase();
  if (k === 'card' || k === 'debit_card' || k === 'credit_card') return 'card';
  if (k === 'cashapp' || k === 'apple_pay' || k === 'google_pay') return k;
  return null;
}

module.exports = {
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_KEYS,
  getPaymentTypeLabel,
  isMethodEnabledInMap,
  paymentTypeToOrionAcceptedOption
};
