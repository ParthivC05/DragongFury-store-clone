import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SpinWheelConfetti } from './SpinWheelGamification';
import { useCountUp } from '../Vip/VipGamification';
import { GUEST_LANDING_SPIN_WIN_SC } from './guestSpinWheelConfig';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

const SIGNUP_TO = '/register';
const CELEBRATE_MS = 2400;
const SC_ICON = '/spinwheel-sc-coin.svg';

const BURST_COINS = [
  { id: 1, emoji: '🪙', x: '-38%', y: '-28%', delay: 0 },
  { id: 2, emoji: '💰', x: '34%', y: '-32%', delay: 0.08 },
  { id: 3, emoji: '✨', x: '-42%', y: '18%', delay: 0.16 },
  { id: 4, emoji: '🎉', x: '40%', y: '12%', delay: 0.05 },
  { id: 5, emoji: '⭐', x: '-8%', y: '-44%', delay: 0.12 },
  { id: 6, emoji: '🪙', x: '12%', y: '38%', delay: 0.2 },
  { id: 7, emoji: '💎', x: '-28%', y: '36%', delay: 0.1 },
  { id: 8, emoji: '✨', x: '32%', y: '-8%', delay: 0.18 },
  { id: 9, emoji: '🎊', x: '-18%', y: '-36%', delay: 0.14 },
  { id: 10, emoji: '🪙', x: '22%', y: '32%', delay: 0.22 },
];

function parseWinAmount(winLabel, winAmount) {
  if (winAmount != null && Number.isFinite(Number(winAmount))) {
    return Number(winAmount);
  }
  const match = String(winLabel ?? '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : GUEST_LANDING_SPIN_WIN_SC;
}

export function GuestSpinWheelWinOverlay({ open, winLabel, winAmount, onClose }) {
  const [phase, setPhase] = useState('celebrate');
  const amount = parseWinAmount(winLabel, winAmount);
  const displayAmount = useCountUp(phase === 'claim' ? amount : 0, 1100);

  useEffect(() => {
    if (!open) {
      setPhase('celebrate');
      return undefined;
    }
    const timer = window.setTimeout(() => setPhase('claim'), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
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
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <SpinWheelConfetti active />
      <div
        className="lp-guest-win-backdrop"
        role="presentation"
        onClick={(e) => {
          if (phase === 'claim' && e.target === e.currentTarget) onClose?.();
        }}
      >
        <AnimatePresence mode="wait">
          {phase === 'celebrate' ? (
            <motion.div
              key="celebrate"
              className="lp-guest-win-celebrate"
              role="status"
              aria-live="polite"
              aria-label="You won"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35 }}
            >
              <div className="lp-guest-win-flash" aria-hidden />
              <div className="lp-guest-win-burst-ring lp-guest-win-burst-ring--1" aria-hidden />
              <div className="lp-guest-win-burst-ring lp-guest-win-burst-ring--2" aria-hidden />
              <div className="lp-guest-win-burst-rays" aria-hidden />

              <div className="lp-guest-win-burst-coins" aria-hidden>
                {BURST_COINS.map((coin) => (
                  <span
                    key={coin.id}
                    className="lp-guest-win-burst-coin"
                    style={{
                      '--coin-x': coin.x,
                      '--coin-y': coin.y,
                      '--coin-delay': `${coin.delay}s`,
                    }}
                  >
                    {coin.emoji}
                  </span>
                ))}
              </div>

              <motion.p
                className="lp-guest-win-eyebrow"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              >
                Congratulations!
              </motion.p>

              <motion.h2
                className="lp-guest-win-jackpot"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 18 }}
              >
                You Won!
              </motion.h2>

              <motion.div
                className="lp-guest-win-prize-tease"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.45 }}
              >
                <img src={SC_ICON} alt="" className="lp-guest-win-prize-tease-icon" draggable={false} />
                <span className="lp-guest-win-prize-tease-text">+{amount} SC</span>
              </motion.div>

              <motion.p
                className="lp-guest-win-celebrate-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1, duration: 0.4 }}
              >
                Your bonus is almost ready…
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key="claim"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lp-guest-win-title"
              className="fdb-modal lp-guest-win-claim swr-result-modal swr-result-modal--win fdb-modal-enter"
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="fdb-close dragonfury-close-button" onClick={onClose} aria-label="Close" />
              <div className="fdb-glow-ring" aria-hidden />
              <div className="swr-result-win-shimmer" aria-hidden />

              <div className="fdb-sparkles" aria-hidden>
                <span className="fdb-spark fdb-spark-1">✦</span>
                <span className="fdb-spark fdb-spark-2">✦</span>
                <span className="fdb-spark fdb-spark-3">★</span>
                <span className="fdb-spark swr-celebrate-spark-5">🎉</span>
                <span className="fdb-spark swr-celebrate-spark-6">✨</span>
              </div>

              <div className="fdb-inner">
                <div className="fdb-badge swr-badge swr-result-badge--win fdb-reveal" style={{ '--fdb-delay': '0.05s' }}>
                  🎉 Congratulations!
                </div>

                <div className="swr-icon-wrap swr-result-icon-wrap fdb-reveal" style={{ '--fdb-delay': '0.1s' }} aria-hidden>
                  <div className="swr-result-celebrate-glyphs">
                    <span className="swr-celebrate-glyph swr-celebrate-glyph-1">✨</span>
                    <span className="swr-celebrate-glyph swr-celebrate-glyph-2">🎉</span>
                    <span className="swr-celebrate-glyph swr-celebrate-glyph-3">⭐</span>
                    <span className="swr-celebrate-glyph swr-celebrate-glyph-4">🪙</span>
                  </div>
                  <div className="swr-icon-stage swr-result-icon--win">
                    <span
                      className="swr-icon-glow"
                      style={{
                        background:
                          'radial-gradient(circle, color-mix(in srgb, var(--dash-gold) 55%, transparent) 0%, transparent 70%)',
                      }}
                    />
                    <img src={SC_ICON} alt="" className="swr-icon-img" draggable={false} />
                  </div>
                </div>

                <div className="swr-result-body fdb-reveal" style={{ '--fdb-delay': '0.15s' }}>
                  <p className="fdb-eyebrow swr-eyebrow">You won a special bonus</p>
                  <h2 id="lp-guest-win-title" className="fdb-title swr-title">
                    Congratulations — +{displayAmount} SC!
                  </h2>
                  <p className="fdb-desc swr-desc">
                    You just won a real bonus! Create your free account now to claim it and keep playing for more rewards.
                  </p>
                  <p className="lp-guest-win-urgency">
                    <span className="lp-guest-win-urgency-dot" aria-hidden />
                    Limited-time guest bonus — sign up to lock it in
                  </p>
                </div>

                <div className="fdb-actions fdb-reveal" style={{ '--fdb-delay': '0.28s' }}>
                  <Link to={SIGNUP_TO} className="fdb-cta lp-guest-win-cta" onClick={onClose}>
                    <span className="fdb-cta-shine" aria-hidden />
                    Sign Up &amp; Claim Your Win
                  </Link>
                  <button type="button" className="lp-guest-win-skip" onClick={onClose}>
                    Maybe later
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>,
    document.body
  );
}
