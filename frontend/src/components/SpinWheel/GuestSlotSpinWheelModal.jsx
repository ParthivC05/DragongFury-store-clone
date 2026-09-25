import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GuestSpinWheelWidget } from './GuestSpinWheelWidget';
import { GuestSpinWheelWinOverlay } from './GuestSpinWheelWinOverlay';
import { GUEST_LANDING_SPIN_WIN_SC } from './guestSpinWheelConfig';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import '../../pages/Landing/landing-dragonfury.css';
import './guest-spin-fury.css';
import '../../styles/club-promo-modals.css';

const PRIZE_CHIPS = [
  { id: 'sc', label: '2–5 SC', glow: 'sc' },
  { id: 'spin', label: 'Free spins', glow: 'spin' },
  { id: 'off', label: '10% off', glow: 'off' },
  { id: 'jack', label: 'Jackpot odds', glow: 'jack' },
];

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
        <div className="fdb-backdrop lp-guest-spin-modal-backdrop fury-spin-backdrop" role="presentation" onClick={onClose}>
          <div
            className="fdb-modal lp-guest-spin-modal fury-spin-modal fdb-modal-enter"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lp-guest-spin-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fury-spin-aurora" aria-hidden />
            <div className="fury-spin-orbs" aria-hidden>
              <span />
              <span />
              <span />
            </div>

            <button
              type="button"
              className="fdb-close fury-spin-close dragonfury-close-button"
              onClick={onClose}
              aria-label="Close"
            />

            <div className="lp-guest-spin-modal-head fury-spin-head">
              <p className="lp-guest-spin-modal-eyebrow fury-spin-live">
                <span className="fury-spin-live-dot" aria-hidden />
                Live bonus spin
              </p>
              <h2 id="lp-guest-spin-modal-title" className="lp-guest-spin-modal-title fury-spin-title">
                SPIN &amp; <span>WIN</span>
              </h2>
              <p className="fury-spin-sub">One free tap. Instant prizes. No purchase needed.</p>
            </div>

            <ul className="fury-spin-prizes" aria-label="Possible prizes">
              {PRIZE_CHIPS.map((chip) => (
                <li key={chip.id} className={`fury-spin-prize fury-spin-prize--${chip.glow}`}>
                  {chip.label}
                </li>
              ))}
            </ul>

            <div className="lp-spinwin-standalone lp-guest-spin-modal-wheel fury-spin-wheel">
              <GuestSpinWheelWidget
                onWin={handleWin}
                compact
                winScAmount={GUEST_LANDING_SPIN_WIN_SC}
              />
            </div>

            <p className="fury-spin-hint">Hit SPIN — your reward is revealed on the wheel</p>
          </div>
        </div>
      ) : null}

      <GuestSpinWheelWinOverlay open={winOverlay} winAmount={winAmount} onClose={closeWinOverlay} />
    </>,
    document.body
  );
}
