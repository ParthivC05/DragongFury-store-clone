import { useState, useEffect } from 'react';
import { formatSc } from '../../utils/currency';
import { ChimeLogoHeader } from '../payment/ChimeLogo';
import { CashAppIcon, PayPalIcon } from '../../assets/icons';
import '../deposit/ChimeDepositModal.css';

/**
 * Modal: confirm withdrawal amount and collect destination for Chime / Cash App / PayPal / Venmo / Zelle / Card / ACH.
 */
export function ChimeCashappWithdrawModal({
  open,
  onClose,
  payoutLabel,
  payoutType: payoutTypeProp,
  currency,
  withdrawMin,
  amountNum,
  availableSc,
  onSubmit,
  submitting
}) {
  const [username, setUsername] = useState('');
  const [cardValid, setCardValid] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const payoutType = String(payoutTypeProp || '').toLowerCase();
  const isChime = payoutLabel === 'Chime' || payoutType === 'chime';
  const isCashapp = payoutType === 'cashapp' || (!isChime && payoutLabel === 'Cash App');
  const isPaypal = payoutLabel === 'PayPal' || payoutType === 'paypal';
  const isVenmo = payoutType === 'venmo' || payoutLabel === 'Venmo';
  const isZelle = payoutType === 'zelle' || payoutLabel === 'Zelle';
  const isCard = payoutType === 'card';
  const isAch = payoutType === 'bank_transfer';
  const usesDollarPrefix = isChime || isCashapp;

  useEffect(() => {
    if (open) {
      setUsername('');
      setCardValid('');
      setRoutingNumber('');
    }
  }, [open, payoutLabel, payoutType]);

  if (!open) return null;

  const title = isChime
    ? 'Chime Withdrawal'
    : isPaypal
      ? 'PayPal Withdrawal'
      : isVenmo
        ? 'Venmo Withdrawal'
        : isZelle
          ? 'Zelle Withdrawal'
          : isCard
            ? 'Debit Card Withdrawal'
            : isAch
              ? 'ACH Withdrawal'
              : 'Cash App Withdrawal';

  const fieldLabel = isChime
    ? 'Chime username'
    : isPaypal
      ? 'PayPal email'
      : isVenmo
        ? 'Venmo email'
        : isZelle
          ? 'Zelle email or phone'
          : isCard
            ? 'Card number'
            : isAch
              ? 'Account number'
              : 'Cash App $Cashtag';

  const placeholder = isChime
    ? 'YourChime'
    : isPaypal || isVenmo
      ? 'you@example.com'
      : isZelle
        ? 'email or +1phone'
        : isCard
          ? '4111111111111111'
          : isAch
            ? 'Bank account number'
            : 'YourCashtag';

  const tagBody = (username || '').trim().replace(/^\$+/, '');
  const cashappError = isCashapp ? cashappCashtagError(tagBody) : null;
  const chimeError = isChime ? chimeSignError(tagBody) : null;
  const destError = cashappError || chimeError;

  const canSubmit =
    profileOk(username, { isCashapp, isChime }) &&
    !destError &&
    (!isCard || /^\d{2}\/\d{4}$/.test(cardValid.trim())) &&
    (!isAch || /^\d{9}$/.test(routingNumber.trim())) &&
    amountNum >= withdrawMin &&
    amountNum <= availableSc &&
    !submitting;

  const submitUsername = () => {
    const raw = (username || '').trim().replace(/^\$+/, '');
    if (!raw) return '';
    if (isChime || isCashapp) return `$${raw}`;
    return raw;
  };

  const handleSubmit = () => {
    const dest = submitUsername();
    if (!dest || destError) return;
    if (isCard) {
      onSubmit(dest, { cardNumber: dest, cardValid: cardValid.trim() });
      return;
    }
    if (isAch) {
      onSubmit(dest, { accountNumber: dest, routingNumber: routingNumber.trim() });
      return;
    }
    onSubmit(dest);
  };

  return (
    <div
      className="dash-chime-modal-root fixed inset-0 z-[10080] flex items-center justify-center p-4 dash-chime-modal-backdrop overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chime-cashapp-modal-title"
    >
      <div className="dash-chime-modal-shell">
        <div className="dash-chime-modal-card dash-chime-withdraw-card">
          <header className="dash-chime-modal-header">
            <div className="dash-chime-modal-header-main">
              {isChime ? (
                <ChimeLogoHeader className="dash-chime-modal-logo" />
              ) : (
                <span
                  className={
                    isPaypal || isVenmo
                      ? 'dash-chime-modal-cashapp-icon dash-chime-modal-paypal-icon'
                      : 'dash-chime-modal-cashapp-icon'
                  }
                  aria-hidden
                >
                  {isPaypal || isVenmo ? <PayPalIcon /> : <CashAppIcon />}
                </span>
              )}
              <h2 id="chime-cashapp-modal-title" className="dash-chime-modal-header-title">
                {title}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="dash-chime-modal-header-close">
              Close
            </button>
          </header>

          <div className="dash-chime-modal-body dash-chime-withdraw-body">
            <p className="dash-chime-modal-desc">
              Double-check your details. We’ll hold this amount until your request is reviewed.
            </p>

            <div className="dash-chime-modal-field">
              <span className="dash-chime-section-label">Withdrawal amount</span>
              <div className="dash-chime-amount-box">
                <span className="dash-chime-amount-symbol">$</span>
                <span className="dash-chime-amount-value tabular-nums">{formatSc(amountNum)}</span>
                <span className="dash-chime-amount-currency">{currency}</span>
              </div>
              <p className="dash-chime-field-hint">
                Minimum withdrawal: {currency} {formatSc(withdrawMin)}
              </p>
            </div>

            <div className="dash-chime-modal-field">
              <label htmlFor="withdraw-destination-username" className="dash-chime-section-label">
                {fieldLabel}
              </label>
              <div
                className={`dash-chime-username-field${
                  usesDollarPrefix ? ' dash-chime-username-field--prefixed' : ''
                }`}
              >
                {usesDollarPrefix ? (
                  <span className="dash-chime-username-prefix" aria-hidden>
                    $
                  </span>
                ) : null}
                <input
                  id="withdraw-destination-username"
                  type="text"
                  autoComplete="off"
                  placeholder={placeholder}
                  value={username}
                  maxLength={isChime ? 50 : isCashapp ? 64 : undefined}
                  onChange={(e) => {
                    let next = e.target.value.replace(/^\$+/, '');
                    if (isCashapp) {
                      next = next.replace(/\s+/g, '').slice(0, 64);
                    } else if (isChime) {
                      next = next.slice(0, 50);
                    }
                    setUsername(next);
                  }}
                  className="dash-input-field dash-chime-withdraw-input"
                  aria-label={fieldLabel}
                  aria-invalid={Boolean(destError && tagBody)}
                />
              </div>
              {isCashapp ? (
                <p className="dash-chime-field-hint">
                  Cash App $Cashtag, starting with $. Example: $abc123
                </p>
              ) : null}
              {isChime ? (
                <p className="dash-chime-field-hint">4–50 characters after $.</p>
              ) : null}
              {destError && tagBody ? (
                <p className="dash-chime-field-hint" style={{ color: '#f87171' }} role="alert">
                  {destError}
                </p>
              ) : null}
            </div>

            {isCard ? (
              <div className="dash-chime-modal-field">
                <label htmlFor="withdraw-card-valid" className="dash-chime-section-label">
                  Expiry (MM/YYYY)
                </label>
                <input
                  id="withdraw-card-valid"
                  type="text"
                  placeholder="01/2028"
                  value={cardValid}
                  onChange={(e) => setCardValid(e.target.value)}
                  className="dash-input-field dash-chime-withdraw-input"
                />
              </div>
            ) : null}

            {isAch ? (
              <div className="dash-chime-modal-field">
                <label htmlFor="withdraw-routing" className="dash-chime-section-label">
                  Routing number (9 digits)
                </label>
                <input
                  id="withdraw-routing"
                  type="text"
                  placeholder="026009593"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="dash-input-field dash-chime-withdraw-input"
                />
              </div>
            ) : null}
          </div>

          <footer className="dash-chime-modal-footer">
            <button type="button" onClick={onClose} className="dash-btn-outline px-5 py-2.5">
              Back
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="dash-btn-cta px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function cashappCashtagError(body) {
  if (!body) return 'Cash App cashtag required, starting with $. Example: $abc123';
  return null;
}

function chimeSignError(body) {
  if (!body) return 'Enter your Chime username.';
  if (body.length < 4 || body.length > 50) {
    return 'Chime name must be 4–50 characters after $.';
  }
  return null;
}

function profileOk(u, { isCashapp, isChime } = {}) {
  const body = (u || '').trim().replace(/^\$+/, '');
  if (isCashapp) return !cashappCashtagError(body);
  if (isChime) return !chimeSignError(body);
  return body.length >= 2;
}
