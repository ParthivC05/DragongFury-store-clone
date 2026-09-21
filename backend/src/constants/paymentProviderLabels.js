'use strict';

/** Admin-facing display names. Internal codes stay dollarpay / xxpay. */
const PAYMENT_PROVIDER_DISPLAY_LABELS = {
  dollarpay: 'Dpay',
  xxpay: 'Xpay',
  selfcrypto: 'Direct Crypto'
};

function getPaymentProviderDisplayLabel(provider, fallback) {
  const key = String(provider || '').trim().toLowerCase();
  if (PAYMENT_PROVIDER_DISPLAY_LABELS[key]) return PAYMENT_PROVIDER_DISPLAY_LABELS[key];
  if (fallback != null && String(fallback).trim() !== '') return fallback;
  return provider || '';
}

module.exports = {
  PAYMENT_PROVIDER_DISPLAY_LABELS,
  getPaymentProviderDisplayLabel
};
