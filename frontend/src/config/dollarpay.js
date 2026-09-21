/**
 * DollarPayWallet credentials from store frontend Vite env.
 * VITE_DOLLARPAY_MERCHANT_ID / VITE_DOLLARPAY_KEY
 */
const merchantIdRaw = import.meta.env.VITE_DOLLARPAY_MERCHANT_ID;
const keyRaw = import.meta.env.VITE_DOLLARPAY_KEY;

export function hasDollarpayCredentials() {
  return Boolean(
    (typeof merchantIdRaw === 'string' && merchantIdRaw.trim()) &&
      (typeof keyRaw === 'string' && keyRaw.trim())
  );
}

export function dollarpayHeaders() {
  const merchantId = typeof merchantIdRaw === 'string' ? merchantIdRaw.trim() : '';
  const apiKey = typeof keyRaw === 'string' ? keyRaw.trim() : '';
  if (!merchantId || !apiKey) return null;
  return {
    'X-Dollarpay-Merchant-Id': merchantId,
    'X-Dollarpay-Key': apiKey
  };
}

export function withDollarpay(config = {}) {
  const extra = dollarpayHeaders();
  if (!extra) return config;
  return { ...config, headers: { ...extra, ...(config.headers || {}) } };
}
