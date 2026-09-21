/**
 * XXPay credentials from store frontend Vite env.
 * VITE_XXPAY_MCH_NO / VITE_XXPAY_API_KEY / VITE_XXPAY_BASE_URL
 */
const mchNoRaw = import.meta.env.VITE_XXPAY_MCH_NO;
const keyRaw = import.meta.env.VITE_XXPAY_API_KEY;
const baseUrlRaw = import.meta.env.VITE_XXPAY_BASE_URL;

export function hasXxpayCredentials() {
  return Boolean(
    typeof mchNoRaw === 'string' &&
      mchNoRaw.trim() &&
      typeof keyRaw === 'string' &&
      keyRaw.trim()
  );
}

export function xxpayHeaders() {
  const mchNo = typeof mchNoRaw === 'string' ? mchNoRaw.trim() : '';
  const apiKey = typeof keyRaw === 'string' ? keyRaw.trim() : '';
  const baseUrl = typeof baseUrlRaw === 'string' ? baseUrlRaw.trim().replace(/\/+$/, '') : '';
  if (!mchNo || !apiKey) return null;
  const headers = {
    'X-Xxpay-Mch-No': mchNo,
    'X-Xxpay-Key': apiKey
  };
  if (baseUrl) headers['X-Xxpay-Base-Url'] = baseUrl;
  return headers;
}

export function withXxpay(config = {}) {
  const extra = xxpayHeaders();
  if (!extra) return config;
  return { ...config, headers: { ...extra, ...(config.headers || {}) } };
}
