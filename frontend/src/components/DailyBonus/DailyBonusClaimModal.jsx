import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { GiftIcon, TicketIcon } from '../../assets/icons';
import { formatSc } from '../../utils/currency';
import { SpinWheelConfetti } from '../SpinWheel/SpinWheelGamification';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

const SPIN_ICON = '/spinwheel-free-spin.svg';
const SC_ICON = '/spinwheel-sc-coin.svg';

const WIN_CELEBRATION_GLYPHS = [
  { id: 1, emoji: '✨', className: 'swr-celebrate-glyph-1' },
  { id: 2, emoji: '🎉', className: 'swr-celebrate-glyph-2' },
  { id: 3, emoji: '⭐', className: 'swr-celebrate-glyph-3' },
  { id: 4, emoji: '🪙', className: 'swr-celebrate-glyph-4' },
  { id: 5, emoji: '🎊', className: 'swr-celebrate-glyph-5' },
  { id: 6, emoji: '✨', className: 'swr-celebrate-glyph-6' },
];

function rewardView(reward) {
  const type = reward?.type;
  if (type === 'sc_coins') {
    const amount = Number(reward.amount_sc) || 0;
    return {
      type,
      accent: 'var(--dash-gold)',
      iconSrc: SC_ICON,
      eyebrow: 'Bonus credits added',
      title: amount > 0 ? `+${formatSc(amount)} SC Won!` : 'SC Bonus Added!',
      desc: 'Credits have been added to your wallet.',
      cta: 'Continue',
      ctaTo: null,
    };
  }
  if (type === 'bonus_spin') {
    const spins = Math.max(1, Number(reward.spin_count) || 1);
    return {
      type,
      accent: 'var(--dash-neon2)',
      iconSrc: SPIN_ICON,
      eyebrow: 'Extra spins unlocked',
      title: `${spins} Free Spin${spins > 1 ? 's' : ''}!`,
      desc: 'Free spins are ready on Daily Spin.',
      cta: 'Open Daily Spin',
      ctaTo: '/spinwheel',
      pendingFreeSpins: reward.pending_free_spins,
    };
  }
  if (type === 'discount_voucher') {
    const percent = Number(reward.percent_off) || 0;
    return {
      type,
      accent: 'var(--dash-purple)',
      iconSrc: null,
      Icon: TicketIcon,
      eyebrow: 'Voucher unlocked',
      title: `${formatSc(percent)}% Off Voucher!`,
      desc: 'Apply it on your next package purchase.',
      terms: ['Valid for 24 hours', 'One-time use only'],
      cta: 'Go to Deposit',
      ctaTo: '/deposit',
    };
  }
  return {
    type: 'unknown',
    accent: 'var(--dash-purple)',
    iconSrc: null,
    Icon: GiftIcon,
    eyebrow: 'Reward claimed',
    title: 'Daily Bonus Claimed!',
    desc: 'Your reward has been added.',
    cta: 'Continue',
    ctaTo: null,
  };
}

export function DailyBonusClaimModal({ reward, dayIndex, balanceSc, onClose }) {
  const view = rewardView(reward);
  const RewardIcon = view.Icon;

  useEffect(() => {
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <>
      <SpinWheelConfetti active />
      <div className="fdb-backdrop swr-result-backdrop" role="presentation" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="db-claim-result-title"
          className="fdb-modal swr-modal swr-result-modal swr-result-modal--win fdb-modal-enter"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="fdb-close dragonfury-close-button" onClick={onClose} aria-label="Close" />

          <div className="fdb-sparkles" aria-hidden>
            <span className="fdb-spark fdb-spark-1">✦</span>
            <span className="fdb-spark fdb-spark-2">✦</span>
            <span className="fdb-spark fdb-spark-3">★</span>
            <span className="fdb-spark fdb-spark-4">✦</span>
            <span className="fdb-spark swr-celebrate-spark-5">🎉</span>
            <span className="fdb-spark swr-celebrate-spark-6">✨</span>
          </div>

          <div className="swr-result-win-shimmer" aria-hidden />

          <div className="fdb-inner">
            <div
              className="fdb-badge swr-badge fdb-reveal swr-result-badge--win"
              style={{ '--fdb-delay': '0.05s' }}
            >
              🎉 Day {dayIndex} Claimed!
            </div>

            <div
              className="swr-icon-wrap swr-result-icon-wrap fdb-reveal"
              style={{ '--fdb-delay': '0.1s' }}
              aria-hidden
            >
              <div className="swr-result-celebrate-glyphs">
                {WIN_CELEBRATION_GLYPHS.map((g) => (
                  <span key={g.id} className={`swr-celebrate-glyph ${g.className}`}>
                    {g.emoji}
                  </span>
                ))}
              </div>
              <div className="swr-icon-stage swr-result-icon--win">
                <span
                  className="swr-icon-glow"
                  style={{
                    background: `radial-gradient(circle, color-mix(in srgb, ${view.accent} 55%, transparent) 0%, transparent 70%)`,
                  }}
                />
                {view.iconSrc ? (
                  <img src={view.iconSrc} alt="" className="swr-icon-img" draggable={false} />
                ) : RewardIcon ? (
                  <RewardIcon
                    width={52}
                    height={52}
                    className="swr-result-no-win-icon"
                    style={{ color: view.accent }}
                  />
                ) : (
                  <span className="swr-result-no-win-icon" style={{ fontSize: '2.4rem' }}>
                    🎁
                  </span>
                )}
              </div>
            </div>

            <div className="swr-result-body fdb-reveal" style={{ '--fdb-delay': '0.15s' }}>
              <p className="fdb-eyebrow swr-eyebrow">{view.eyebrow}</p>
              <h2 id="db-claim-result-title" className="fdb-title swr-title">
                {view.title}
              </h2>
              <p className="fdb-desc swr-desc">{view.desc}</p>
              {Array.isArray(view.terms) && view.terms.length > 0 && (
                <ul className="db-claim-voucher-terms">
                  {view.terms.map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ul>
              )}

              {view.type === 'sc_coins' && balanceSc != null && (
                <p className="swr-result-wallet-balance">
                  Wallet balance: <strong>{formatSc(balanceSc)} SC</strong>
                </p>
              )}
              {view.type === 'bonus_spin' && view.pendingFreeSpins != null && (
                <p className="swr-result-balance swr-result-balance--spin">
                  Free spins available: <strong>{view.pendingFreeSpins}</strong>
                </p>
              )}
            </div>

            <div className="fdb-actions fdb-reveal" style={{ '--fdb-delay': '0.38s' }}>
              {view.ctaTo ? (
                <Link to={view.ctaTo} className="fdb-cta swr-cta" onClick={onClose}>
                  <span className="fdb-cta-shine" aria-hidden />
                  {view.cta}
                </Link>
              ) : (
                <button type="button" className="fdb-cta swr-cta" onClick={onClose}>
                  <span className="fdb-cta-shine" aria-hidden />
                  {view.cta}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
