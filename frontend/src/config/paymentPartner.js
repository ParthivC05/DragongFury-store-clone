/**
 * Per-store CentryOS partner code (Vite env). Sent on API calls that proxy to the Payment API.
 * Set VITE_PAYMENT_PARTNER_CODE in each white-label frontend clone.
 */
const raw = import.meta.env.VITE_PAYMENT_PARTNER_CODE;

export function paymentPartnerHeaders() {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;
  return { 'X-Payment-Partner-Code': trimmed };
}

/** Merge payment partner header into fetch config for request.js */
export function withPaymentPartner(config = {}) {
  const extra = paymentPartnerHeaders();
  if (!extra) return config;
  return { ...config, headers: { ...extra, ...(config.headers || {}) } };
}
