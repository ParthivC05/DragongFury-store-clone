import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { formatSc } from '../../utils/currency';
import { SpinWheelConfetti } from './SpinWheelGamification';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

const SPIN_ICON = '/spinwheel-free-spin.svg';
const SC_ICON = '/spinwheel-sc-coin.svg';
const COUPON_ICON = '/spinwheel-coupon.svg';

const WIN_CELEBRATION_GLYPHS = [
  { id: 1, emoji: '✨', className: 'swr-celebrate-glyph-1' },
  { id: 2, emoji: '🎉', className: 'swr-celebrate-glyph-2' },
  { id: 3, emoji: '⭐', className: 'swr-celebrate-glyph-3' },
  { id: 4, emoji: '🪙', className: 'swr-celebrate-glyph-4' },
  { id: 5, emoji: '🎊', className: 'swr-celebrate-glyph-5' },
  { id: 6, emoji: '✨', className: 'swr-celebrate-glyph-6' },
];

function outcomeAccent(type) {
  if (type === 'no_win') return 'var(--dash-muted)';
  if (type === 'sc_coins') return 'var(--dash-gold)';
  if (type === 'free_spin') return 'var(--dash-neon2)';
  if (type === 'coupon') return '#f59e0b';
  return 'var(--dash-purple)';
}

function outcomeIconSrc(type) {
  if (type === 'sc_coins') return SC_ICON;
  if (type === 'free_spin') return SPIN_ICON;
  if (type === 'coupon') return COUPON_ICON;
  return null;
}

function resolveOutcomeAmount(outcome, type) {
  if (!outcome) return 0;
  const fields = [outcome.value, outcome.amount, outcome.sc_amount, outcome.win_amount];
  for (const field of fields) {
    if (field == null) continue;
    const n = Number(field);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const labelText = String(outcome.label ?? '');
  if (type === 'sc_coins') {
    const match = labelText.match(/(\d+(?:\.\d+)?)\s*SC/i);
    if (match) return Number(match[1]);
  }
  if (type === 'free_spin') {
    const match = labelText.match(/(\d+)/);
    if (match) return Math.max(1, Number(match[1]));
  }
  if (type === 'coupon') {
    const match = labelText.match(/(\d+(?:\.\d+)?)\s*%/);
    if (match) return Number(match[1]);
  }
  return 0;
}

/**
 * @param {{
 *   outcome: object,
 *   balanceSc?: number|null,
 *   pendingFreeSpins?: number|null,
 *   canSpinNow?: boolean,
 *   dailyLimitReached?: boolean,
 *   nextSpinLabel?: string|null,
 *   maxSpinsPerDay?: number|null,
 *   onClose: () => void
 * }} props
 */
export function SpinWheelResultModal({
  outcome,
  balanceSc,
  pendingFreeSpins,
  canSpinNow = false,
  dailyLimitReached = false,
  nextSpinLabel = null,
  maxSpinsPerDay = null,
  onClose
}) {
  const type = outcome?.type;
  const value = resolveOutcomeAmount(outcome, type);
  const label = outcome?.label ?? '';
  const couponCode = String(outcome?.coupon_code || outcome?.couponCode || '').trim().toUpperCase();
  const isNoWin = type === 'no_win';
  const isSc = type === 'sc_coins';
  const isFreeSpin = type === 'free_spin';
  const isCoupon = type === 'coupon';
  const isWin = !isNoWin;
  const accent = outcomeAccent(type);
  const iconSrc = outcomeIconSrc(type);
  const freeSpinsDeferred = isFreeSpin && !canSpinNow;
  const freeSpinLimitNote =
    maxSpinsPerDay != null && Number(maxSpinsPerDay) > 0
      ? `Up to ${Number(maxSpinsPerDay)} spins can be used every 24 hours.`
      : 'A daily spin limit applies every 24 hours.';
  const [copied, setCopied] = useState(false);

  const copyCouponCode = () => {
    if (!couponCode) return;
    const markCopied = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(couponCode).then(markCopied).catch(() => {});
    }
  };

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
      <SpinWheelConfetti active={isWin} />
      <div className="fdb-backdrop swr-result-backdrop" role="presentation" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="swr-result-title"
          className={`fdb-modal swr-modal swr-result-modal fdb-modal-enter ${isWin ? 'swr-result-modal--win' : 'swr-result-modal--lose'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="fdb-close dragonfury-close-button" onClick={onClose} aria-label="Close" />

          <div className="fdb-sparkles" aria-hidden>
            <span className="fdb-spark fdb-spark-1">✦</span>
            <span className="fdb-spark fdb-spark-2">✦</span>
            <span className="fdb-spark fdb-spark-3">★</span>
            <span className="fdb-spark fdb-spark-4">✦</span>
            {isWin && (
              <>
                <span className="fdb-spark swr-celebrate-spark-5">🎉</span>
                <span className="fdb-spark swr-celebrate-spark-6">✨</span>
              </>
            )}
          </div>

          {isWin && <div className="swr-result-win-shimmer" aria-hidden />}

          <div className="fdb-inner">
            <div
              className={`fdb-badge swr-badge fdb-reveal ${isWin ? 'swr-result-badge--win' : ''}`}
              style={{ '--fdb-delay': '0.05s' }}
            >
              {isWin ? '🎉 You Won!' : '🛞 Spin Complete'}
            </div>

            <div className="swr-icon-wrap swr-result-icon-wrap fdb-reveal" style={{ '--fdb-delay': '0.1s' }} aria-hidden>
              {isWin && (
                <div className="swr-result-celebrate-glyphs">
                  {WIN_CELEBRATION_GLYPHS.map((g) => (
                    <span key={g.id} className={`swr-celebrate-glyph ${g.className}`}>
                      {g.emoji}
                    </span>
                  ))}
                </div>
              )}
              <div className={`swr-icon-stage ${isWin ? 'swr-result-icon--win' : 'swr-result-icon--lose'}`}>
                <span
                  className="swr-icon-glow"
                  style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 55%, transparent) 0%, transparent 70%)` }}
                />
                {iconSrc ? (
                  <img src={iconSrc} alt="" className="swr-icon-img" draggable={false} />
                ) : (
                  <span className="swr-result-no-win-icon">✕</span>
                )}
              </div>
            </div>

            <div className="swr-result-body fdb-reveal" style={{ '--fdb-delay': '0.15s' }}>
              <p className="fdb-eyebrow swr-eyebrow">
                {isNoWin
                  ? 'Better luck next time'
                  : isSc
                    ? 'Bonus credits added'
                    : isFreeSpin
                      ? freeSpinsDeferred
                        ? 'Bonus spin saved'
                        : 'Extra spins unlocked'
                      : isCoupon
                        ? 'Deposit coupon unlocked'
                        : 'Reward claimed'}
              </p>

              <h2 id="swr-result-title" className="fdb-title swr-title">
                {isNoWin
                  ? 'No Prize This Spin'
                  : isSc && value > 0
                    ? `+${formatSc(value)} SC Won!`
                    : isSc
                      ? 'SC Bonus Added!'
                      : isFreeSpin
                        ? `${value} Free Spin${value > 1 ? 's' : ''}!`
                        : isCoupon
                          ? `${value}% Off Next Deposit`
                          : label}
              </h2>

              <p className="fdb-desc swr-desc">
                {isNoWin
                  ? `You landed on ${label || 'No Win'}. Come back when your next daily spin unlocks.`
                  : isSc
                    ? 'Bonus credits have been added to your wallet instantly.'
                    : isFreeSpin && freeSpinsDeferred
                      ? dailyLimitReached
                        ? `Your free spin${value > 1 ? 's are' : ' is'} saved. ${freeSpinLimitNote}${
                            nextSpinLabel
                              ? ` You can use ${value > 1 ? 'them' : 'it'} in ${nextSpinLabel}.`
                              : ' You can use them after the 24-hour limit resets.'
                          }`
                        : `Your free spin${value > 1 ? 's are' : ' is'} saved.${
                            nextSpinLabel
                              ? ` Available in ${nextSpinLabel}.`
                              : ' Come back when your next spin unlocks.'
                          }`
                      : isFreeSpin
                        ? 'Extra spins are ready — tap SPIN again to use one now.'
                        : isCoupon
                          ? 'Use this code once on your next deposit. It only works on this account.'
                          : 'Check your account for your reward.'}
              </p>

              {isCoupon && couponCode && (
                <div className="swr-result-coupon">
                  <span className="swr-result-coupon-label">Your code</span>
                  <code className="swr-result-coupon-code">{couponCode}</code>
                  <button type="button" className="swr-result-coupon-copy" onClick={copyCouponCode}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}

              {isSc && balanceSc != null && (
                <p className="swr-result-wallet-balance">
                  Wallet balance: <strong>{formatSc(balanceSc)} SC</strong>
                </p>
              )}
              {isFreeSpin && pendingFreeSpins != null && (
                <p className="swr-result-balance swr-result-balance--spin">
                  {freeSpinsDeferred ? 'Saved free spins' : 'Free spins available'}:{' '}
                  <strong>{pendingFreeSpins}</strong>
                </p>
              )}
            </div>

            <div className="fdb-actions fdb-reveal" style={{ '--fdb-delay': '0.38s' }}>
              {isCoupon ? (
                <Link to="/deposit" className="fdb-cta swr-cta" onClick={onClose}>
                  <span className="fdb-cta-shine" aria-hidden />
                  Use on Deposit
                </Link>
              ) : (
                <button type="button" className="fdb-cta swr-cta" onClick={onClose}>
                  <span className="fdb-cta-shine" aria-hidden />
                  {isFreeSpin && freeSpinsDeferred
                    ? 'Got it'
                    : isWin
                      ? 'Claim & Continue'
                      : 'Try Again Later'}
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
