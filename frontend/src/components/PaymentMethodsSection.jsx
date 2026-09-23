import { Link } from 'react-router-dom';

const SIGNUP_TO = '/register';

const ICONIFY = 'https://api.iconify.design';

const PAYMENT_METHODS = [
  { id: 'visa', name: 'Visa', brand: 'visa', src: `${ICONIFY}/logos/visa.svg` },
  { id: 'mc', name: 'Mastercard', brand: 'mastercard', src: `${ICONIFY}/logos/mastercard.svg` },
  { id: 'cashapp', name: 'Cash App', brand: 'cash_app', src: '/df-online/pay/cash-app.svg' },
  { id: 'chime', name: 'Chime', brand: 'chime', src: `${ICONIFY}/thesvg-color/chime-dark.svg` },
  { id: 'gpay', name: 'Google Pay', brand: 'google_pay', src: `${ICONIFY}/logos/google-pay.svg` },
  { id: 'apay', name: 'Apple Pay', brand: 'apple_pay', src: `${ICONIFY}/logos/apple-pay.svg` },
  { id: 'btc', name: 'Bitcoin', brand: 'bitcoin', src: `${ICONIFY}/logos/bitcoin.svg` },
  { id: 'usdt', name: 'USDT', brand: 'usdt', src: `${ICONIFY}/token-branded/usdt.svg` },
  { id: 'bank', name: 'Bank transfer', brand: 'bank', src: `${ICONIFY}/mdi/bank.svg?color=%231264d9` },
];

export function PaymentMethodsSection() {
  return (
    <section className="payment-section" id="payments" aria-labelledby="payment-title">
      <div className="payment-shell">
        <p className="payment-eyebrow">Secure hosted checkout</p>
        <h2 className="payment-title" id="payment-title">
          Load Your Way
        </h2>
        <div className="payment-tiles">
          {PAYMENT_METHODS.map((method) => (
            <Link
              key={method.id}
              to={SIGNUP_TO}
              className={`payment-method payment-method--${method.id}`}
              aria-label={`${method.name} — sign up to add funds`}
            >
              <span
                className={`payment-brand-logo payment-brand-logo--${method.brand}`}
                aria-hidden="true"
              >
                <img src={method.src} alt="" width={96} height={64} loading="lazy" decoding="async" />
              </span>
              <span className="payment-method-title">{method.name}</span>
            </Link>
          ))}
        </div>
        <p className="payment-note">
          Instant loads through secure hosted checkout — Visa, Mastercard, Cash App, Chime, Apple
          Pay, Google Pay, bank transfer, and crypto.
        </p>
      </div>
    </section>
  );
}
