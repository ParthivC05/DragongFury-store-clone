'use strict';

/**
 * CentryOS / Payment API configuration.
 * Used by the payment module for deposit (payin) and later withdraw.
 *
 * Partner code resolution: optional `X-Payment-Partner-Code` header when allowed,
 * else PAYMENT_PARTNER_CODE env (optional server fallback), then default.
 *
 * Security: set PAYMENT_PARTNER_CODE_HEADER_ALLOWLIST to a comma-separated list of
 * allowed header values. When set, any other header value is ignored (server env/default only).
 */

/** Map white-label store codes that are not CentryOS partner codes to a real partner. */
const PARTNER_CODE_ALIASES = {
  dragonfury: 'goodwork'
};

const resolvePaymentPartnerCode = (explicitFromRequest) => {
  const t = typeof explicitFromRequest === 'string' ? explicitFromRequest.trim() : '';
  if (t) {
    const aliased = PARTNER_CODE_ALIASES[t.toLowerCase()];
    return aliased || t;
  }
  const env = process.env.PAYMENT_PARTNER_CODE;
  return (env && String(env).trim()) || 'PARTNER001';
};

function parsePartnerHeaderAllowlist() {
  const raw = process.env.PAYMENT_PARTNER_CODE_HEADER_ALLOWLIST;
  if (!raw || !String(raw).trim()) return null;
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const getPaymentPartnerCodeFromRequest = (req) => {
  const allowlist = parsePartnerHeaderAllowlist();
  const headerRaw =
    req && req.headers && typeof req.headers['x-payment-partner-code'] === 'string'
      ? req.headers['x-payment-partner-code'].trim()
      : '';
  if (allowlist && allowlist.length) {
    if (headerRaw && allowlist.includes(headerRaw)) return resolvePaymentPartnerCode(headerRaw);
    return resolvePaymentPartnerCode();
  }
  if (!req || !req.headers) return resolvePaymentPartnerCode();
  if (headerRaw) return resolvePaymentPartnerCode(headerRaw);
  return resolvePaymentPartnerCode();
};

const getPaymentConfig = () => ({
  baseUrl: (process.env.PAYMENT_API_BASE_URL || 'https://payment-api.orionstarsweeps.com/api').replace(/\/+$/, ''),
  partnerCode: resolvePaymentPartnerCode()
});

const isPaymentConfigured = () => {
  const { baseUrl } = getPaymentConfig();
  return Boolean(baseUrl);
};

const isPaymentLogEnabled = () =>
  process.env.PAYMENT_LOG_ENABLED === 'true' || process.env.PAYMENT_LOG_ENABLED === '1';

const isPaymentErrorLogEnabled = () =>
  process.env.PAYMENT_ERROR_LOG_ENABLED === 'true' || process.env.PAYMENT_ERROR_LOG_ENABLED === '1' ||
  isPaymentLogEnabled();

module.exports = {
  getPaymentConfig,
  resolvePaymentPartnerCode,
  getPaymentPartnerCodeFromRequest,
  isPaymentConfigured,
  isPaymentLogEnabled,
  isPaymentErrorLogEnabled
};
