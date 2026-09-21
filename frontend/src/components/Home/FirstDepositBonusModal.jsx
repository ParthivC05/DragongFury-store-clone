import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useDepositBonusCountdown, depositTierLabel, formatBonusHighlight } from '../../hooks/useDepositBonusEligibility';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

function promoField(promotion, snake, camel) {
  if (!promotion) return undefined;
  return promotion[snake] ?? promotion[camel];
}

function getHighlightValue(promotion, eligibility) {
  const fromEligibility = formatBonusHighlight(eligibility);
  if (fromEligibility) return fromEligibility;
  if (!promotion) return null;
  const type = promoField(promotion, 'bonus_type', 'bonusType');
  const value = promoField(promotion, 'bonus_value', 'bonusValue');
  if (type === 'percentage' && value != null) return `${value}%`;
  if (type === 'fixed' && value != null) return `${value}`;
  return null;
}

function normalizePromoText(s) {
  return String(s || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function isRedundantPromoTitle(title) {
  const n = normalizePromoText(title);
  return !n || n.includes('firstdepositbonus') || n === 'firstdeposit';
}

const PERKS = [
  'Instant bonus credited after your qualifying deposit',
  'Limited-time new user offer — up to 3 deposits',
];

const REFERRAL_PERKS = [
  'Activate your refer bonus with your first package purchase',
  'Unlock games, recharge, and redeem after depositing',
];

export function FirstDepositBonusModal({
  open,
  onClose,
  onClaimBonus,
  promotion,
  eligibility,
  activationBonusType = null
}) {
  const countdown = useDepositBonusCountdown(eligibility?.expires_at);
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

  const depositNumber = eligibility?.next_deposit_number || 1;
  // Match DepositRequiredModal: only show refer copy when referral_friend_signup was granted.
  const showReferralActivate = activationBonusType === 'referral' && depositNumber === 1;
  const highlight = showReferralActivate ? null : getHighlightValue(promotion, eligibility);
  const tierLabel = depositTierLabel(depositNumber);
  const promoTitle = eligibility?.next_title?.trim() || promotion?.title?.trim() || '';
  const description = showReferralActivate
    ? 'Make your first package purchase to activate your refer bonus and unlock games, recharge, and redeem.'
    : promotion?.description?.trim() ||
      `Make your ${tierLabel.toLowerCase()} top-up within the offer window and unlock an exclusive bonus credited straight to your wallet.`;
  const showPromoTitle = !showReferralActivate && promoTitle && !isRedundantPromoTitle(promoTitle);
  const perks = showReferralActivate ? REFERRAL_PERKS : PERKS;
  const title = showReferralActivate ? 'ACTIVATE YOUR REFER BONUS' : `${tierLabel.toUpperCase()} DEPOSIT BONUS!`;
  const eyebrow = showReferralActivate ? 'Referral reward' : 'Exclusive welcome reward';
  const badge = showReferralActivate
    ? 'Referral offer'
    : countdown
      ? `Ends in ${countdown}`
      : 'Limited offer';
  const ctaLabel = showReferralActivate ? 'Activate Refer Bonus' : 'Claim Bonus Now';

  return createPortal(
    <div className="fdb-backdrop" role="presentation" onClick={onClose}>
      <div
        className="fdb-modal fdb-modal-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fdb-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="fdb-close" onClick={onClose} aria-label="Close" />

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
            {eyebrow}
          </p>

          <h2 id="fdb-modal-title" className="fdb-title fdb-reveal" style={{ '--fdb-delay': '0.2s' }}>
            {title}
          </h2>

          {highlight && (
            <p className="fdb-highlight fdb-reveal" style={{ '--fdb-delay': '0.25s' }}>
              <span className="fdb-highlight-value">{highlight}</span>
              <span className="fdb-highlight-label">EXTRA</span>
            </p>
          )}

          {showPromoTitle && (
            <p className="fdb-promo-name fdb-reveal" style={{ '--fdb-delay': '0.3s' }}>
              {promoTitle}
            </p>
          )}

          <p className="fdb-desc fdb-reveal" style={{ '--fdb-delay': '0.35s' }}>
            {description}
          </p>

          <ul className="fdb-perks fdb-reveal" style={{ '--fdb-delay': '0.4s' }}>
            {perks.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>

          <div className="fdb-actions fdb-reveal" style={{ '--fdb-delay': '0.45s' }}>
            <Link
              to="/deposit"
              className="fdb-cta no-underline"
              onClick={() => (onClaimBonus ?? onClose)()}
            >
              <span className="fdb-cta-shine" aria-hidden />
              {ctaLabel}
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
