import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import { useAuth } from '../../context/AuthContext';
import { needsPhoneVerification } from '../../utils/purchaseProfile';
import { PhoneVerifyGateModal } from '../Auth/PhoneVerifyGateModal';

export function DepositRequiredModal({ open, onClose, activationBonusType = 'welcome' }) {
  const { user, lockedBalanceSc } = useAuth();
  const showPhoneUnlock = Boolean(
    open && needsPhoneVerification(user) && Number(lockedBalanceSc) > 0
  );
  const isReferral = activationBonusType === 'referral';
  const badge = isReferral ? 'Referral bonus' : 'Welcome bonus';
  const title = isReferral ? 'ACTIVATE YOUR REFER BONUS' : 'ACTIVATE YOUR WELCOME BONUS';
  const description = isReferral
    ? 'Make your first package purchase to activate your refer bonus and unlock casino games, platform game recharge, and redeem. Choose a package on the deposit page to get started.'
    : 'Make your first package purchase to claim your welcome bonus and unlock casino games, platform game recharge, and redeem. Choose a package on the deposit page to get started.';

  useEffect(() => {
    if (!open || showPhoneUnlock) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, showPhoneUnlock]);

  if (showPhoneUnlock) {
    return <PhoneVerifyGateModal open onClose={onClose} />;
  }

  if (!open) return null;

  return createPortal(
    <div className="fdb-backdrop" role="presentation" onClick={onClose}>
      <div
        className="fdb-modal fdb-modal-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-required-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="fdb-close dragonfury-close-button" onClick={onClose} aria-label="Close" />

        <div className="fdb-glow-ring" aria-hidden />

        <div className="fdb-sparkles" aria-hidden>
          <span className="fdb-spark fdb-spark-1">✦</span>
          <span className="fdb-spark fdb-spark-2">✦</span>
          <span className="fdb-spark fdb-spark-3">★</span>
          <span className="fdb-spark fdb-spark-4">✦</span>
        </div>

        <div className="fdb-inner">
          <div className="fdb-badge fdb-reveal" style={{ '--fdb-delay': '0.05s' }}>
            {badge}
          </div>

          <div className="fdb-icon-wrap fdb-reveal" style={{ '--fdb-delay': '0.1s' }} aria-hidden>
            <span className="fdb-icon-glow" />
            <span className="fdb-icon">🎁</span>
          </div>

          <p className="fdb-eyebrow fdb-reveal" style={{ '--fdb-delay': '0.15s' }}>
            One step to unlock full access
          </p>

          <h2 id="deposit-required-modal-title" className="fdb-title fdb-reveal" style={{ '--fdb-delay': '0.2s' }}>
            {title}
          </h2>

          <p className="fdb-desc fdb-reveal" style={{ '--fdb-delay': '0.35s' }}>
            {description}
          </p>

          <div className="fdb-actions fdb-reveal" style={{ '--fdb-delay': '0.45s' }}>
            <Link
              to="/deposit"
              className="fdb-cta no-underline onboarding-view-packages-btn"
              onClick={() => {
                try {
                  if (localStorage.getItem('onboarding_pending') === 'true') {
                    window.dispatchEvent(new CustomEvent('onboarding:view-packages-clicked'));
                  }
                } catch {
                  /* ignore */
                }
                onClose();
              }}
            >
              <span className="fdb-cta-shine" aria-hidden />
              View Packages
            </Link>
            <button type="button" className="fdb-dismiss" onClick={onClose}>
              Maybe later
            </button>
            {import.meta.env.DEV ? (
              <button
                type="button"
                className="fdb-dismiss"
                onClick={() => {
                  try {
                    localStorage.setItem('dragonfury:skip-deposit-gate', '1');
                  } catch {
                    /* ignore */
                  }
                  onClose();
                }}
              >
                Skip for local testing
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
