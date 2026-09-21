'use strict';

/**
 * Credentials from store frontend Vite env headers (not backend .env).
 * VITE_XXPAY_MCH_NO / VITE_XXPAY_API_KEY / optional VITE_XXPAY_BASE_URL
 */
function getXxpayCredentialsFromRequest(req) {
  const h = req?.headers || {};
  const mchNo = String(h['x-xxpay-mch-no'] || '').trim();
  const apiKey = String(h['x-xxpay-key'] || '').trim();
  const baseUrl = String(h['x-xxpay-base-url'] || '').trim().replace(/\/+$/, '');
  if (!mchNo || !apiKey) return null;
  return { mchNo, apiKey, baseUrl: baseUrl || null };
}

function requireXxpayCredentials(req) {
  const creds = getXxpayCredentialsFromRequest(req);
  if (!creds) {
    const err = new Error(
      'XXPay credentials missing. Set VITE_XXPAY_MCH_NO and VITE_XXPAY_API_KEY on the store frontend.'
    );
    err.statusCode = 400;
    throw err;
  }
  return creds;
}

module.exports = { getXxpayCredentialsFromRequest, requireXxpayCredentials };
