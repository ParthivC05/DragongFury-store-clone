import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

const SPIN_ICON = '/spinwheel-free-spin.svg';

export function SpinWheelReadyModal({ open, onClose, onSpinNow }) {
  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fdb-backdrop" role="presentation" onClick={onClose}>
      <div
        className="fdb-modal swr-modal fdb-modal-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swr-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="fdb-close" onClick={onClose} aria-label="Close" />

        <div className="fdb-glow-ring swr-glow-ring" aria-hidden />

        <div className="fdb-sparkles" aria-hidden>
          <span className="fdb-spark fdb-spark-1">✦</span>
          <span className="fdb-spark fdb-spark-2">✦</span>
          <span className="fdb-spark fdb-spark-3">★</span>
          <span className="fdb-spark fdb-spark-4">✦</span>
        </div>

        <div className="fdb-inner">
          <div className="fdb-badge swr-badge fdb-reveal" style={{ '--fdb-delay': '0.05s' }}>
            Daily reward
          </div>

          <div className="swr-icon-wrap fdb-reveal" style={{ '--fdb-delay': '0.1s' }} aria-hidden>
            <div className="swr-icon-stage">
              <span className="swr-icon-glow" />
              <img src={SPIN_ICON} alt="" className="swr-icon-img" draggable={false} />
            </div>
          </div>

          <p className="fdb-eyebrow swr-eyebrow fdb-reveal" style={{ '--fdb-delay': '0.15s' }}>
            Your spin is ready
          </p>

          <h2 id="swr-modal-title" className="fdb-title swr-title fdb-reveal" style={{ '--fdb-delay': '0.2s' }}>
            SPIN THE WHEEL!
          </h2>

          <p className="fdb-desc swr-desc fdb-reveal" style={{ '--fdb-delay': '0.3s' }}>
            Win free SC, bonus credits, and surprise rewards. One spin per day — don&apos;t miss out!
          </p>

          <ul className="fdb-perks swr-perks fdb-reveal" style={{ '--fdb-delay': '0.35s' }}>
            <li>Free daily spin for all players</li>
            <li>Instant prizes added to your wallet</li>
          </ul>

          <div className="fdb-actions fdb-reveal" style={{ '--fdb-delay': '0.4s' }}>
            <Link
              to="/spinwheel"
              className="fdb-cta swr-cta no-underline"
              onClick={() => (onSpinNow ?? onClose)()}
            >
              <span className="fdb-cta-shine" aria-hidden />
              Spin Now
            </Link>
            <button type="button" className="fdb-dismiss" onClick={onClose}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
