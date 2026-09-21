import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { formatSc } from '../../utils/currency';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import './PaymentSuccessScreen.css';

const COPY = {
  credited: {
    title: 'Purchase Successful',
    subtitle: 'Your purchase has been credited to your account. Thank you!',
    amountSuffix: 'added to your balance.',
    cta: 'Play Now',
  },
  submitted: {
    title: 'Deposit Submitted',
    subtitle: 'We received your Chime deposit request. Your balance will update once our team confirms payment.',
    amountSuffix: 'deposit request submitted.',
    cta: 'Play Now',
  },
};

/**
 * Full-screen purchase success overlay — Dragon Fury theme.
 */
export function PaymentSuccessScreen({
  open,
  onDismiss,
  amount = null,
  currency = 'USD',
  playDestination = '/',
  variant = 'credited',
}) {
  const navigate = useNavigate();
  const copy = COPY[variant] || COPY.credited;

  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = lockBodyScroll();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onDismiss]);

  if (!open) return null;

  const safeDestination =
    typeof playDestination === 'string' &&
    playDestination.startsWith('/') &&
    !playDestination.startsWith('//')
      ? playDestination
      : '/';

  const handlePlayNow = () => {
    onDismiss?.();
    navigate(safeDestination);
  };

  const formattedAmount =
    amount != null && Number.isFinite(Number(amount))
      ? currency === 'USD' || currency === 'SC'
        ? `$${formatSc(amount)}`
        : `${currency} ${formatSc(amount)}`
      : null;

  const content = (
    <div className="pss-root" role="dialog" aria-modal="true" aria-labelledby="pss-title">
      <div className="pss-backdrop" aria-hidden />

      <div className="pss-panel">
        <div className="pss-icon-wrap" aria-hidden>
          <div className="pss-icon-glow" />
          <div className="pss-icon-ring pss-icon-ring--outer" />
          <div className="pss-icon-ring pss-icon-ring--inner" />
          <div className="pss-icon-core">
            <svg className="pss-check-svg" viewBox="0 0 48 48" fill="none" aria-hidden>
              <path
                className="pss-check-path"
                d="M12 24l9 9 17-20"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1 id="pss-title" className="pss-title">
          {copy.title}
        </h1>

        <p className="pss-subtitle">{copy.subtitle}</p>

        {formattedAmount && (
          <p className="pss-amount-line">
            <span className="pss-amount-value">{formattedAmount}</span>
            <span className="pss-amount-label">{copy.amountSuffix}</span>
          </p>
        )}

        <button type="button" className="pss-play-btn" onClick={handlePlayNow} autoFocus>
          {copy.cta}
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
