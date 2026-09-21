import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './KycIdentityGateModal.css';

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3l8 3.2v5.4c0 5.2-3.4 9.1-8 10.9-4.6-1.8-8-5.7-8-10.9V6.2L12 3z" strokeLinejoin="round" />
      <path d="M9.2 12.1l1.9 1.9 3.8-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3.2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Identity gate — shown when KYC is required before withdraw.
 * Close lets the user leave and browse other pages; banner CTA can reopen it.
 */
export function KycIdentityGateModal({
  open,
  status,
  declineReason,
  starting = false,
  onVerify,
  onRefresh,
  onClose
}) {
  const s = String(status || 'not_started').toLowerCase();
  const pending = s === 'pending' || s === 'in_review';
  const declined = s === 'declined' || s === 'rejected';
  const mode = pending ? 'pending' : declined ? 'declined' : 'required';

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('kyc-gate-active');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.classList.remove('kyc-gate-active');
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const title =
    mode === 'pending'
      ? 'Verification in progress'
      : mode === 'declined'
        ? 'Verification declined'
        : 'Verify your identity';

  const text =
    mode === 'pending'
      ? 'We’re reviewing your documents. Withdrawals unlock as soon as you’re approved — usually within a few minutes.'
      : mode === 'declined'
        ? declineReason ||
          'We couldn’t verify your identity. Try again with a clear, well-lit photo of a valid ID.'
        : 'A quick one-time check is required before your first withdrawal. It only takes a couple of minutes.';

  const badge =
    mode === 'pending' ? 'In review' : mode === 'declined' ? 'Action needed' : 'Required to withdraw';

  const modal = (
    <div
      className={`kyc-gate kyc-gate--${mode}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kyc-gate-title"
      aria-describedby="kyc-gate-text"
    >
      <div className="kyc-gate__card">
        <div className="kyc-gate__shine" aria-hidden />

        {typeof onClose === 'function' ? (
          <button type="button" className="kyc-gate__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

        <div className="kyc-gate__icon-wrap">
          <div
            className={`kyc-gate__ring${mode === 'declined' ? ' kyc-gate__ring--paused' : ''}`}
            aria-hidden
          />
          <div className="kyc-gate__icon">
            {mode === 'pending' ? <ClockIcon /> : mode === 'declined' ? <AlertIcon /> : <ShieldIcon />}
          </div>
        </div>

        <div className="kyc-gate__badge">{badge}</div>
        <h2 id="kyc-gate-title" className="kyc-gate__title">
          {title}
        </h2>
        <p id="kyc-gate-text" className="kyc-gate__text">
          {text}
        </p>

        {mode === 'required' || mode === 'declined' ? (
          <>
            {mode === 'required' ? (
              <ol className="kyc-gate__steps">
                <li className="kyc-gate__step">
                  <span className="kyc-gate__step-num">1</span>
                  <span>Upload a government-issued photo ID</span>
                </li>
                <li className="kyc-gate__step">
                  <span className="kyc-gate__step-num">2</span>
                  <span>Take a quick selfie for a match check</span>
                </li>
                <li className="kyc-gate__step">
                  <span className="kyc-gate__step-num">3</span>
                  <span>Get approved and unlock withdrawals</span>
                </li>
              </ol>
            ) : null}

            <button
              type="button"
              className="kyc-gate__cta"
              disabled={starting}
              onClick={onVerify}
            >
              {starting
                ? 'Starting…'
                : mode === 'declined'
                  ? 'Retry verification'
                  : 'Verify identity'}
            </button>
          </>
        ) : (
          <button type="button" className="kyc-gate__cta kyc-gate__cta--secondary" onClick={onRefresh}>
            Refresh status
          </button>
        )}

        <p className="kyc-gate__trust">
          <LockIcon />
          Encrypted · One-time only
        </p>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
