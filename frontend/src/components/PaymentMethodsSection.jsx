import { Link } from 'react-router-dom';

const SIGNUP_TO = '/register';

const PAYMENT_METHODS = [
  { id: 'visa', name: 'VISA', type: 'Credit / Debit', mark: 'visa' },
  { id: 'mc', name: 'MASTERCARD', type: 'Credit / Debit', mark: 'mc' },
  { id: 'cashapp', name: 'CASH APP', type: 'Instant', mark: 'cashapp' },
  { id: 'chime', name: 'CHIME', type: 'Instant transfer', mark: 'chime' },
  { id: 'gpay', name: 'GOOGLE PAY', type: 'Tap to pay', mark: 'gpay' },
  { id: 'apay', name: 'APPLE PAY', type: 'Touch ID', mark: 'apay' },
  { id: 'btc', name: 'BITCOIN', type: 'Crypto', mark: 'btc' },
  { id: 'usdt', name: 'USDT', type: 'Tether', mark: 'usdt' },
  { id: 'bank', name: 'BANK TRANSFER', type: 'ACH · Wire', mark: 'bank' },
];

function PaymentMethodMark({ mark }) {
  switch (mark) {
    case 'visa':
      return <span className="dash-pay-mark dash-pay-mark--visa">VISA</span>;
    case 'mc':
      return (
        <span className="dash-pay-mark dash-pay-mark--mc" aria-hidden>
          <i />
          <i />
        </span>
      );
    case 'cashapp':
      return <span className="dash-pay-mark dash-pay-mark--sq dash-pay-mark--cashapp">$</span>;
    case 'chime':
      return <span className="dash-pay-mark dash-pay-mark--word dash-pay-mark--chime">chime</span>;
    case 'gpay':
      return <span className="dash-pay-mark dash-pay-mark--word dash-pay-mark--gpay">G Pay</span>;
    case 'apay':
      return <span className="dash-pay-mark dash-pay-mark--word dash-pay-mark--apay"> Pay</span>;
    case 'btc':
      return <span className="dash-pay-mark dash-pay-mark--sq dash-pay-mark--btc">₿</span>;
    case 'usdt':
      return <span className="dash-pay-mark dash-pay-mark--sq dash-pay-mark--usdt">₮</span>;
    case 'bank':
      return <span className="dash-pay-mark dash-pay-mark--sq dash-pay-mark--bank">🏦</span>;
    default:
      return null;
  }
}

/**
 * Guest home payment methods — inspo #payments pay-grid.
 */
export function PaymentMethodsSection() {
  return (
    <section id="payments" className="dash-payments-section dash-animate-in" aria-label="Payment methods">
      <div className="dash-payments-head">
        <p className="dash-payments-kick">PAYMENT METHODS</p>
        <h2 className="dash-payments-title">Fast · secure · multiple options for withdrawals</h2>
      </div>

      <div className="dash-payments-grid">
        {PAYMENT_METHODS.map((method) => (
          <Link key={method.id} to={SIGNUP_TO} className="dash-payments-card">
            <div className="dash-payments-card-pic">
              <PaymentMethodMark mark={method.mark} />
            </div>
            <div className="dash-payments-card-name">{method.name}</div>
            <div className="dash-payments-card-type">{method.type}</div>
          </Link>
        ))}
      </div>

      <p className="dash-payments-ssl">
        🔒 <b>256-bit SSL Encrypted</b> — transactions use industry-standard encryption. Complete any
        verification steps shown in your account.
      </p>
    </section>
  );
}
