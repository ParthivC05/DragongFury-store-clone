/**
 * XXPay is resolved on the backend (XXPAY_MCH_NO / XXPAY_API_KEY).
 * Do not put secrets in VITE_ — they are compiled into the public JS bundle.
 */
export function hasXxpayCredentials() {
  return true;
}

export function xxpayHeaders() {
  return null;
}

export function withXxpay(config = {}) {
  return config;
}
