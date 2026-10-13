/**
 * DollarPay is resolved on the backend (DOLLARPAY_MERCHANT_ID / DOLLARPAY_KEY).
 * Do not put secrets in VITE_ — they are compiled into the public JS bundle.
 */
export function hasDollarpayCredentials() {
  return true;
}

export function dollarpayHeaders() {
  return null;
}

export function withDollarpay(config = {}) {
  return config;
}
