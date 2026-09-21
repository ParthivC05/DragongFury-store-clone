import { Link } from 'react-router-dom';

const SPIN_ICON = '/spinwheel-free-spin.svg';

function formatCountdown(secondsLeft) {
  if (secondsLeft == null || secondsLeft <= 0) return '00:00:00';
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pickFeaturedPromotion(promotions, isAuthenticated) {
  if (!Array.isArray(promotions) || promotions.length === 0) return null;
  if (!isAuthenticated) return promotions[0];
  return (
    promotions.find((p) => p.bonus_trigger_type === 'first_deposit') ||
    promotions.find((p) => String(p.slug || '').includes('first-deposit')) ||
    promotions[0]
  );
}

export function DashboardFeatured({
  isAuthenticated,
  hasCompletedDeposit = false,
  countdownSeconds,
  spinWheelCanSpin,
  spinWheelSecondsLeft,
  spinWheelCooldownSec = 86400,
  promotions = [],
  affiliateRewardDescription,
  registerPath,
}) {
  const featuredPromotion = pickFeaturedPromotion(promotions, isAuthenticated);
  const showReferEarn = isAuthenticated && hasCompletedDeposit;
  const spinPct =
    spinWheelCanSpin || !spinWheelSecondsLeft
      ? 100
      : Math.max(0, 100 - (spinWheelSecondsLeft / spinWheelCooldownSec) * 100);

  const spinDest = isAuthenticated ? '/spinwheel' : registerPath;

  return (
    <section className="dash-featured dash-animate-in dash-delay-1" aria-label="Featured offers">
      <Link to={spinDest} className={`dash-featured-spin${spinWheelCanSpin ? ' dash-featured-spin-ready' : ''}`}>
        <div className="dash-featured-spin-glow" aria-hidden />
        <img src={SPIN_ICON} alt="" className="dash-featured-spin-icon" />
        <div className="dash-featured-spin-body">
          <span className="dash-featured-spin-tag">Daily Reward</span>
          <span className="dash-featured-spin-title">
            {spinWheelCanSpin ? 'Spin Ready!' : 'Spin the Wheel'}
          </span>
          {!spinWheelCanSpin && spinWheelSecondsLeft != null && isAuthenticated && (
            <span className="dash-featured-spin-timer tabular-nums">
              Next in {formatCountdown(spinWheelSecondsLeft)}
            </span>
          )}
          {!isAuthenticated && (
            <span className="dash-featured-spin-timer">Sign up to spin daily</span>
          )}
        </div>
        <div className="dash-featured-spin-bar" aria-hidden>
          <span className="dash-featured-spin-fill" style={{ width: `${spinPct}%` }} />
        </div>
        <span className="dash-featured-spin-cta">{spinWheelCanSpin ? 'SPIN NOW →' : 'GO →'}</span>
      </Link>

      {showReferEarn ? (
        <Link to="/account/affiliate" className="dash-featured-promo dash-featured-refer">
          <span className="dash-featured-promo-emoji" aria-hidden>🎯</span>
          <div className="dash-featured-promo-body">
            <span className="dash-featured-promo-tag">Invite Friends</span>
            <span className="dash-featured-promo-title">Refer &amp; Earn</span>
            <span className="dash-featured-promo-timer">
              {affiliateRewardDescription ||
                'Earn up to 10% when friends purchase coin packages'}
            </span>
          </div>
          <span className="dash-featured-promo-cta">EARN →</span>
        </Link>
      ) : (
        <Link
          to={isAuthenticated ? '/promotions' : registerPath}
          className="dash-featured-promo"
        >
          <span className="dash-featured-promo-emoji dash-gift-wiggle" aria-hidden>🎁</span>
          <div className="dash-featured-promo-body">
            <span className="dash-featured-promo-tag">Hot Offer</span>
            <span className="dash-featured-promo-title">
              {featuredPromotion?.title || 'Promotions'}
            </span>
            {countdownSeconds != null ? (
              <span className="dash-featured-promo-timer tabular-nums dash-countdown-glow">
                Ends {formatCountdown(countdownSeconds)}
              </span>
            ) : (
              <span className="dash-featured-promo-timer">Bonuses &amp; rewards</span>
            )}
          </div>
          <span className="dash-featured-promo-cta">VIEW →</span>
        </Link>
      )}
    </section>
  );
}
