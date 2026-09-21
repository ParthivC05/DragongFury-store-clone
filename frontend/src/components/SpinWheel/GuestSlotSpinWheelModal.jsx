import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GuestSpinWheelWidget } from './GuestSpinWheelWidget';
import { GuestSpinWheelWinOverlay } from './GuestSpinWheelWinOverlay';
import { GUEST_LANDING_SPIN_WIN_SC } from './guestSpinWheelConfig';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import '../../pages/Landing/landing-dragonfury.css';

export function GuestSlotSpinWheelModal({ open, onClose }) {
  const [winOverlay, setWinOverlay] = useState(false);
  const [winAmount, setWinAmount] = useState(GUEST_LANDING_SPIN_WIN_SC);

  const handleWin = useCallback((outcome) => {
    const amount = outcome?.value != null ? Number(outcome.value) : GUEST_LANDING_SPIN_WIN_SC;
    setWinAmount(amount);
    onClose?.();
    setWinOverlay(true);
  }, [onClose]);

  const closeWinOverlay = useCallback(() => {
    setWinOverlay(false);
    setWinAmount(GUEST_LANDING_SPIN_WIN_SC);
  }, []);

  useEffect(() => {
    if (!open || winOverlay) return undefined;
    const releaseScrollLock = lockBodyScroll();
    document.body.classList.add('guest-spin-modal-open');
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      document.body.classList.remove('guest-spin-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, winOverlay, onClose]);

  if (!open && !winOverlay) return null;

  return createPortal(
    <>
      {open && !winOverlay ? (
        <div className="fdb-backdrop lp-guest-spin-modal-backdrop" role="presentation" onClick={onClose}>
          <div
            className="fdb-modal lp-guest-spin-modal fdb-modal-enter"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lp-guest-spin-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="fdb-close" onClick={onClose} aria-label="Close" />

            <div className="lp-guest-spin-modal-head">
              <p className="lp-guest-spin-modal-eyebrow">Free bonus spin</p>
              <h2 id="lp-guest-spin-modal-title" className="lp-guest-spin-modal-title">
                SPIN &amp; <span>WIN</span>
              </h2>
            </div>

            <div className="lp-spinwin-standalone lp-guest-spin-modal-wheel">
              <GuestSpinWheelWidget
                onWin={handleWin}
                compact
                winScAmount={GUEST_LANDING_SPIN_WIN_SC}
              />
            </div>
          </div>
        </div>
      ) : null}

      <GuestSpinWheelWinOverlay open={winOverlay} winAmount={winAmount} onClose={closeWinOverlay} />
    </>,
    document.body
  );
}
