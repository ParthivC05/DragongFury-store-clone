'use strict';

/**
 * XXPay pay-in amounts (per channel).
 * ShowDoc does not publish a whitelist — merchant channel tables reject with
 * PARAMETER ERROR[Not allowed amount …]. Keep in sync with store frontends.
 */

const XXPAY_CASHAPP_AMOUNTS = [
  9.99, 14.99, 17.99, 19.99, 24.99, 29.99, 30.99, 39.99, 49.99, 59.99, 99.99, 124.99, 129.99,
  149.99, 199.99, 300, 400, 500
];

const XXPAY_CHIME_AMOUNTS = [
  20, 25, 30, 31, 40, 50, 60, 100, 125, 130, 150, 200, 300, 400, 500
];

/** Default for other XXPay methods until channel-specific lists are confirmed. */
const XXPAY_DEFAULT_AMOUNTS = [...XXPAY_CASHAPP_AMOUNTS];

/** Minimum XXPay withdrawal (SC / USD). Enforced on create when payout provider is xxpay. */
const XXPAY_WITHDRAW_MIN = 30;

/** @deprecated use getXxpayPayinAmountsForPaymentType */
const XXPAY_PAYIN_AMOUNTS = XXPAY_DEFAULT_AMOUNTS;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function normalizePaymentType(paymentType) {
  return String(paymentType || '').trim().toLowerCase();
}

function getXxpayPayinAmountsForPaymentType(paymentType) {
  const key = normalizePaymentType(paymentType);
  if (key === 'chime') return XXPAY_CHIME_AMOUNTS;
  if (key === 'cashapp' || key === 'ecashapp') return XXPAY_CASHAPP_AMOUNTS;
  if (
    key === 'apple_pay' ||
    key === 'applepay' ||
    key === 'google_pay' ||
    key === 'googlepay' ||
    key === 'card' ||
    key === 'credit_card' ||
    key === 'debit_card'
  ) {
    return XXPAY_DEFAULT_AMOUNTS;
  }
  return XXPAY_DEFAULT_AMOUNTS;
}

function isAllowedXxpayPayinAmount(amount, paymentType) {
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return false;
  const list = getXxpayPayinAmountsForPaymentType(paymentType);
  const allowed = new Set(list.map((a) => a.toFixed(2)));
  return allowed.has(n.toFixed(2));
}

function assertAllowedXxpayPayinAmount(amount, paymentType) {
  const n = round2(amount);
  const list = getXxpayPayinAmountsForPaymentType(paymentType);
  if (isAllowedXxpayPayinAmount(n, paymentType)) return n;
  const err = new Error(
    `XXPay does not allow amount ${Number.isFinite(n) ? n.toFixed(2) : amount} for ${normalizePaymentType(paymentType) || 'this method'}. Choose one of: ${list.map((a) => a.toFixed(2)).join(', ')}.`
  );
  err.statusCode = 400;
  throw err;
}

module.exports = {
  XXPAY_PAYIN_AMOUNTS,
  XXPAY_CASHAPP_AMOUNTS,
  XXPAY_CHIME_AMOUNTS,
  XXPAY_DEFAULT_AMOUNTS,
  XXPAY_WITHDRAW_MIN,
  getXxpayPayinAmountsForPaymentType,
  isAllowedXxpayPayinAmount,
  assertAllowedXxpayPayinAmount
};
