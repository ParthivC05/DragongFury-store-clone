/**
 * XXPay pay-in amounts (per channel).
 * Keep in sync with backend xxpay.amounts.js (merchant channel tables).
 */

export const XXPAY_CASHAPP_AMOUNTS = [
  9.99, 14.99, 17.99, 19.99, 24.99, 29.99, 30.99, 39.99, 49.99, 59.99, 99.99, 124.99, 129.99,
  149.99, 199.99, 300, 400, 500
];

export const XXPAY_CHIME_AMOUNTS = [
  20, 25, 30, 31, 40, 50, 60, 100, 125, 130, 150, 200, 300, 400, 500
];

export const XXPAY_DEFAULT_AMOUNTS = [...XXPAY_CASHAPP_AMOUNTS];

/** Minimum XXPay withdrawal — keep in sync with backend xxpay.amounts.js */
export const XXPAY_WITHDRAW_MIN = 30;

/** @deprecated use getXxpayAmountsForPaymentType */
export const XXPAY_PAYIN_AMOUNTS = XXPAY_DEFAULT_AMOUNTS;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function getXxpayAmountsForPaymentType(paymentType) {
  const key = String(paymentType || '').trim().toLowerCase();
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

/** Presets for the currently selected XXPay method. */
export function getXxpayPresetsForPaymentType(paymentType) {
  return getXxpayAmountsForPaymentType(paymentType).filter((a) => Number(a) <= 150);
}

export function isAllowedXxpayAmount(amount, paymentType) {
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return false;
  const allowed = new Set(getXxpayAmountsForPaymentType(paymentType).map((a) => a.toFixed(2)));
  return allowed.has(n.toFixed(2));
}

export function paymentTypeUsesXxpay(paymentTypes, paymentTypeKey) {
  const key = String(paymentTypeKey || '').trim().toLowerCase();
  if (!key) return false;
  const pt = (paymentTypes || []).find((p) => p.key === key);
  const code = pt?.providers?.[0]?.providerCode;
  return String(code || '').toLowerCase() === 'xxpay';
}
