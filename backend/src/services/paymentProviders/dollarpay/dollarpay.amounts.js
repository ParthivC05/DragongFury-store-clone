'use strict';

/**
 * DollarPay pay-in fixed amounts (API docs 2026-08-02).
 * Wallet (Cash App / Apple Pay / Google Pay): is_pay 1–3
 * Credit Card: is_pay 4 — separate amount list
 */
const DOLLARPAY_WALLET_PAYIN_AMOUNTS = [
  4.99, 5.99, 6.99, 7.99, 8.99, 9.99, 10.99, 11.99, 12.99, 13.99, 14.99, 17.99, 19.99, 22.99,
  24.99, 29.99, 30.99, 32.99, 39.99, 49.99, 54.99, 59.99, 99.99, 109.99, 124.99, 129.99, 149.99,
  199.99, 249.99, 299.99, 399.99, 499.99
];

const DOLLARPAY_CARD_PAYIN_AMOUNTS = [
  9.99, 10.99, 11.99, 12.99, 13.99, 14.99, 17.99, 19.99, 22.99, 24.99, 29.99, 30.99, 32.99,
  39.99, 49.99, 54.99, 59.99, 99.99, 109.99, 124.99, 129.99, 149.99, 199.99
];

/** @deprecated use getDollarpayPayinAmounts — kept for callers that expect the wallet list */
const DOLLARPAY_PAYIN_AMOUNTS = DOLLARPAY_WALLET_PAYIN_AMOUNTS;

function getDollarpayPayinAmounts(paymentType) {
  const key = (paymentType || '').toString().trim().toLowerCase();
  return key === 'card' || key === 'credit_card' ? DOLLARPAY_CARD_PAYIN_AMOUNTS : DOLLARPAY_WALLET_PAYIN_AMOUNTS;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isAllowedPayinAmount(amount, paymentType) {
  const list = getDollarpayPayinAmounts(paymentType);
  const allowed = new Set(list.map((a) => a.toFixed(2)));
  const n = round2(amount);
  return Number.isFinite(n) && allowed.has(n.toFixed(2));
}

/**
 * Map a requested deposit amount to a DollarPay-accepted payin amount.
 * Exact match, or whole dollars → amount - 0.01 when that value is allowed (e.g. 25 → 24.99).
 * Returns null when DollarPay cannot take the amount (caller should fall back to OrionStars).
 * Does NOT snap to an arbitrary closest .99 amount.
 *
 * @param {number} amount
 * @param {string} paymentType
 * @param {{ allowWholeDollarSnap?: boolean }} [options]
 *   allowWholeDollarSnap defaults true for custom amounts; set false for packages (exact only).
 */
function toDollarpayPayinAmount(amount, paymentType, options = {}) {
  const allowWholeDollarSnap = options.allowWholeDollarSnap !== false;
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isAllowedPayinAmount(n, paymentType)) return n;

  if (!allowWholeDollarSnap) return null;

  const cents = Math.round(n * 100) % 100;
  if (cents === 0) {
    const candidate = round2(n - 0.01);
    if (isAllowedPayinAmount(candidate, paymentType)) return candidate;
  }

  return null;
}

/**
 * Resolve whether DollarPay can process this amount (exact or whole-dollar snap).
 * @returns {{ amount: number, snapped: boolean } | null}
 */
function resolveDollarpayPayinAmount(amount, paymentType, options = {}) {
  const requested = round2(amount);
  const resolved = toDollarpayPayinAmount(requested, paymentType, options);
  if (resolved == null) return null;
  return { amount: resolved, snapped: resolved !== requested };
}

const DOLLARPAY_GENERIC_CLIENT_ERROR =
  'Payment could not be started. Please try again or use another method.';

/**
 * Never expose raw DollarPay API messages (PARAMETER ERROR, SK… codes, channel limits, etc.) to clients.
 * Raw `msg` is still logged in dollarpay.client assertOk.
 */
function sanitizeDollarpayClientMessage(message) {
  const msg = (message || '').toString().trim();
  if (!msg) return DOLLARPAY_GENERIC_CLIENT_ERROR;

  if (
    /^amount\s*:\s*[\d.,\s]+$/i.test(msg) ||
    /amount\s*:\s*4\.99/i.test(msg) ||
    /amount\s*:\s*10\.99/i.test(msg) ||
    /amount\s+is\s+not\s+supported/i.test(msg)
  ) {
    return 'Please enter an amount ending in .99 (for example 10.99, 19.99).';
  }
  if (/channel\s*limit/i.test(msg) || /valid\s+payment\s+method/i.test(msg)) {
    return 'This payment option is unavailable for the selected amount. Please try another amount or method.';
  }
  return DOLLARPAY_GENERIC_CLIENT_ERROR;
}

module.exports = {
  DOLLARPAY_PAYIN_AMOUNTS,
  DOLLARPAY_WALLET_PAYIN_AMOUNTS,
  DOLLARPAY_CARD_PAYIN_AMOUNTS,
  getDollarpayPayinAmounts,
  isAllowedPayinAmount,
  toDollarpayPayinAmount,
  resolveDollarpayPayinAmount,
  sanitizeDollarpayClientMessage
};
