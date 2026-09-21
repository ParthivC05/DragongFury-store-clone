'use strict';

/** Credentials come from store frontend headers (VITE_DOLLARPAY_*), not backend .env. */
function getDollarpayCredentialsFromRequest(req) {
  const h = req?.headers || {};
  const merchantId = String(h['x-dollarpay-merchant-id'] || '').trim();
  const apiKey = String(h['x-dollarpay-key'] || '').trim();
  if (!merchantId || !apiKey) return null;
  return { merchantId, apiKey };
}

function requireDollarpayCredentials(req) {
  const creds = getDollarpayCredentialsFromRequest(req);
  if (!creds) {
    const err = new Error(
      'DollarPay credentials missing. Set VITE_DOLLARPAY_MERCHANT_ID and VITE_DOLLARPAY_KEY on the store frontend.'
    );
    err.statusCode = 400;
    throw err;
  }
  return creds;
}

module.exports = { getDollarpayCredentialsFromRequest, requireDollarpayCredentials };
