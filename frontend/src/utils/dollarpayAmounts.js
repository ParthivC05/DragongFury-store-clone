/**
 * DollarPay fixed pay-in amounts (merchant API).
 * Wallet: Cash App / Apple Pay / Google Pay (is_pay 1–3)
 * Card: Credit/Debit (is_pay 4)
 * Keep in sync with partner-platform backend dollarpay.amounts.js
 *
 * Backend owns snap + OrionStars fallback. Frontend only soft-snaps whole dollars
 * (e.g. 25 → 24.99) for UX; unsupported amounts still submit and fall back server-side.
 */

export const DOLLARPAY_WALLET_AMOUNTS = [
  4.99, 5.99, 6.99, 7.99, 8.99, 9.99, 10.99, 11.99, 12.99, 13.99, 14.99, 17.99, 19.99, 22.99,
  24.99, 29.99, 30.99, 32.99, 39.99, 49.99, 54.99, 59.99, 99.99, 109.99, 124.99, 129.99, 149.99,
  199.99, 249.99, 299.99, 399.99, 499.99
];

/** Credit card (is_pay=4) — DollarPay merchant API 2026-08-02 */
export const DOLLARPAY_CARD_AMOUNTS = [
  9.99, 10.99, 11.99, 12.99, 13.99, 14.99, 17.99, 19.99, 22.99, 24.99, 29.99, 30.99, 32.99,
  39.99, 49.99, 54.99, 59.99, 99.99, 109.99, 124.99, 129.99, 149.99, 199.99
];

/** High amounts excluded from deposit chips (still valid for API / custom entry). */
const DOLLARPAY_PRESET_EXCLUDED = new Set(
  [9.99, 109.99, 124.99, 129.99, 149.99, 199.99].map((a) => a.toFixed(2))
);

/** Deposit presets: wallet ∩ card common amounts, minus high excluded chips. */
export const DOLLARPAY_SHARED_PRESETS = (() => {
  const cardSet = new Set(DOLLARPAY_CARD_AMOUNTS.map((a) => a.toFixed(2)));
  return DOLLARPAY_WALLET_AMOUNTS.filter(
    (a) => cardSet.has(a.toFixed(2)) && !DOLLARPAY_PRESET_EXCLUDED.has(a.toFixed(2))
  );
})();

const DOLLARPAY_CONSTRAINED_TYPES = new Set([
  'card',
  'credit_card',
  'debit_card',
  'cashapp',
  'apple_pay',
  'google_pay'
]);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function isDollarpayConstrainedPaymentType(paymentType) {
  return DOLLARPAY_CONSTRAINED_TYPES.has(String(paymentType || '').trim().toLowerCase());
}

export function getDollarpayAmountsForPaymentType(paymentType) {
  const key = String(paymentType || '').trim().toLowerCase();
  return key === 'card' || key === 'credit_card' || key === 'debit_card'
    ? DOLLARPAY_CARD_AMOUNTS
    : DOLLARPAY_WALLET_AMOUNTS;
}

export function getAllDollarpayAmounts() {
  return Array.from(
    new Set([...DOLLARPAY_WALLET_AMOUNTS, ...DOLLARPAY_CARD_AMOUNTS].map((a) => a.toFixed(2)))
  )
    .map((s) => Number(s))
    .sort((a, b) => a - b);
}

export function isAllowedDollarpayAmount(amount, paymentType) {
  const list = getDollarpayAmountsForPaymentType(paymentType);
  const allowed = new Set(list.map((a) => a.toFixed(2)));
  const n = round2(amount);
  return Number.isFinite(n) && allowed.has(n.toFixed(2));
}

/** True if amount is accepted by at least one DollarPay method list. */
export function isAllowedByAnyDollarpayMethod(amount) {
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return false;
  return isAllowedDollarpayAmount(n, 'cashapp') || isAllowedDollarpayAmount(n, 'card');
}

/**
 * Map amount → DollarPay-accepted value for a payment type (mirrors backend).
 * Exact match, or whole dollars → amount - 0.01 when allowed (25 → 24.99).
 * Returns null when DollarPay cannot take the amount (backend falls back to OrionStars).
 */
export function toDollarpayPayinAmount(amount, paymentType, options = {}) {
  const allowWholeDollarSnap = options.allowWholeDollarSnap !== false;
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isAllowedDollarpayAmount(n, paymentType)) return n;

  if (!allowWholeDollarSnap) return null;

  const cents = Math.round(n * 100) % 100;
  if (cents === 0) {
    const candidate = round2(n - 0.01);
    if (isAllowedDollarpayAmount(candidate, paymentType)) return candidate;
  }

  return null;
}

/** Soft-snap whole dollars to .99 when present on any method list; otherwise null. */
export function toNearestAnyDollarpayAmount(amount) {
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isAllowedByAnyDollarpayMethod(n)) return n;

  const cents = Math.round(n * 100) % 100;
  if (cents === 0) {
    const candidate = round2(n - 0.01);
    if (isAllowedByAnyDollarpayMethod(candidate)) return candidate;
  }

  return null;
}

export function paymentTypeUsesDollarpay(paymentTypes, paymentTypeKey) {
  const key = String(paymentTypeKey || '').trim().toLowerCase();
  if (!key || key === 'chime' || key === 'crypto' || key === 'scrypto') return false;
  const pt = (paymentTypes || []).find((p) => p.key === key);
  const code = pt?.providers?.[0]?.providerCode;
  return String(code || '').toLowerCase() === 'dollarpay';
}

export function storeHasDollarpayMethods(paymentTypes = []) {
  return (paymentTypes || []).some((pt) => paymentTypeUsesDollarpay(paymentTypes, pt.key));
}

/**
 * Always show admin-enabled payment types.
 * DollarPay amount support is handled by backend snap / OrionStars fallback — do not hide methods.
 */
export function filterPaymentTypesForAmount(paymentTypes = []) {
  return Array.isArray(paymentTypes) ? paymentTypes : [];
}

/**
 * Soft-resolve a charge amount for UX only (whole-dollar .99 snap).
 * If snap is not possible, returns the original amount (backend may fall back to Orion).
 */
export function ensureDollarpaySupportedAmount(amount) {
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return { amount: n, adjusted: false };
  if (isAllowedByAnyDollarpayMethod(n)) return { amount: n, adjusted: false };
  const snapped = toNearestAnyDollarpayAmount(n);
  if (snapped == null) return { amount: n, adjusted: false };
  return { amount: snapped, adjusted: snapped !== n };
}

/** True when DollarPay cannot take this amount (exact or whole-dollar snap) — backend will use Orion. */
export function dollarpayNeedsOrionFallback(amount, paymentType, { isPackage = false } = {}) {
  const resolved = toDollarpayPayinAmount(amount, paymentType, {
    allowWholeDollarSnap: !isPackage
  });
  return resolved == null;
}
