/**
 * Deposit history status for UI.
 * Backend may still return legacy "expired" for open DollarPay/Orion links;
 * keep those as pending for 3 hours (same window as reconcile/auto-expire).
 */
const AWAITING_PAYMENT_MS = 3 * 60 * 60 * 1000;

export function normalizeDepositHistoryStatus(status, date) {
  const st = String(status || 'pending').toLowerCase().trim() || 'pending';
  if (st !== 'expired') return st;
  const created = new Date(date).getTime();
  if (!Number.isFinite(created)) return st;
  if (Date.now() - created < AWAITING_PAYMENT_MS) return 'pending';
  return 'expired';
}
