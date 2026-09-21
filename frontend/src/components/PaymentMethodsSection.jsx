import { Link } from 'react-router-dom';

const SIGNUP_TO = '/register';

const ICONIFY = 'https://api.iconify.design';

const PAYMENT_METHODS = [
  { id: 'visa', name: 'Visa', type: 'Credit / Debit', src: `${ICONIFY}/logos/visa.svg`, w: 78, wide: true },
  { id: 'mc', name: 'Mastercard', type: 'Credit / Debit', src: `${ICONIFY}/logos/mastercard.svg`, w: 52 },
  { id: 'cashapp', name: 'Cash App', type: 'Instant', src: `${ICONIFY}/simple-icons/cashapp.svg?color=%2300D632`, w: 34 },
  { id: 'chime', name: 'Chime', type: 'Instant transfer', src: `${ICONIFY}/thesvg-color/chime-dark.svg`, w: 92, wide: true },
  { id: 'gpay', name: 'Google Pay', type: 'Tap to pay', src: `${ICONIFY}/logos/google-pay.svg`, w: 92, wide: true },
  { id: 'apay', name: 'Apple Pay', type: 'Touch ID', src: `${ICONIFY}/logos/apple-pay.svg`, w: 78, invert: true, wide: true },
  { id: 'btc', name: 'Bitcoin', type: 'Crypto', src: `${ICONIFY}/logos/bitcoin.svg`, w: 34 },
  { id: 'usdt', name: 'USDT', type: 'Tether', src: `${ICONIFY}/token-branded/usdt.svg`, w: 34 },
  { id: 'bank', name: 'Bank transfer', type: 'ACH · Wire', src: `${ICONIFY}/mdi/bank.svg?color=%23B6FF2A`, w: 34 },
];

export function PaymentMethodsSection() {
  return (
    <section id="payments" className="dash-payments-section dash-animate-in" aria-label="Payment methods">
      <div className="dash-payments-head">
        <p className="dash-payments-kick">PAYMENT METHODS</p>
        <h2 className="dash-payments-title">Pay in. Cash out. Same wallet.</h2>
      </div>

      <div className="dash-payments-grid">
        {PAYMENT_METHODS.map((method) => (
          <Link key={method.id} to={SIGNUP_TO} className="dash-payments-card">
            <div className="dash-payments-card-pic">
              <img
                src={method.src}
                alt={method.name}
                width={method.w}
                height={36}
                className={`dash-pay-logo${method.wide ? ' dash-pay-logo--wide' : ''}${method.invert ? ' dash-pay-logo--invert' : ''}`}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="dash-payments-card-name">{method.name}</div>
            <div className="dash-payments-card-type">{method.type}</div>
          </Link>
        ))}
      </div>

      <p className="dash-payments-ssl">
        🔒 <b>256-bit SSL Encrypted</b> — cards, Cash App, Chime, Apple Pay, Google Pay, and crypto.
      </p>
    </section>
  );
}
