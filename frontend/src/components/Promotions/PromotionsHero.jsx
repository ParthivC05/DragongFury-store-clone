import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const PARTICLES = [
  { id: 1, e: '🎁', t: '8%', l: '5%', d: 0 },
  { id: 2, e: '🪙', t: '22%', r: '6%', d: 0.4 },
  { id: 3, e: '⭐', t: '55%', l: '3%', d: 0.8 },
  { id: 4, e: '💎', t: '70%', r: '12%', d: 0.2 },
  { id: 5, e: '🔥', t: '35%', r: '22%', d: 1.2 },
];

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

function PromoGfxParticles() {
  return (
    <div className="dash-promo-gfx-particles" aria-hidden>
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="dash-promo-gfx-particle"
          style={{ top: p.t, left: p.l, right: p.r, animationDelay: `${p.d}s` }}
        >
          {p.e}
        </span>
      ))}
      <span className="dash-promo-gfx-orbit dash-promo-gfx-orbit-a" />
      <span className="dash-promo-gfx-orbit dash-promo-gfx-orbit-b" />
    </div>
  );
}

const QUESTS = [
  { id: 'deposit', icon: '💰', label: 'Deposit', xp: 'Bonus XP', to: '/deposit' },
  { id: 'spin', icon: '🛞', label: 'Daily Spin', xp: 'Free rewards', to: '/spinwheel' },
  { id: 'vip', icon: '👑', label: 'VIP Tiers', xp: 'Rank up', to: '/account/vip' },
];

export function PromotionsHero({ offerCount, bonusCount, countdownSeconds, featuredTitle }) {
  return (
    <section className="dash-promo-hero dash-animate-in" aria-label="Promotions overview">
      <div className="dash-promo-hero-bg" aria-hidden />
      <PromoGfxParticles />

      <div className="dash-promo-hero-inner">
        <div className="dash-promo-hero-badges">
          <motion.span
            className="dash-promo-live-badge"
            animate={{ opacity: [1, 0.65, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ⚡ Live Offers
          </motion.span>
          <span className="dash-promo-hero-pill">Rewards Hub</span>
        </div>

        <div className="dash-promo-hero-main">
          <motion.span
            className="dash-promo-hero-icon dash-gift-wiggle"
            aria-hidden
            animate={{ y: [0, -8, 0], rotate: [-4, 4, -4] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            🎁
          </motion.span>
          <div className="dash-promo-hero-copy">
            <p className="dash-promo-hero-kicker">Level up your play</p>
            <h2 className="dash-promo-hero-title">
              Bonuses &amp; <span className="dash-promo-hero-gold">Power-Ups</span>
            </h2>
            <p className="dash-promo-hero-sub">
              {featuredTitle
                ? <>Featured: <strong>{featuredTitle}</strong></>
                : 'Claim rewards, unlock exclusive deals, and stack bonuses.'}
            </p>
            {countdownSeconds != null && (
              <p className="dash-promo-hero-countdown tabular-nums dash-countdown-glow">
                ⏱ Ends in {formatCountdown(countdownSeconds)}
              </p>
            )}
          </div>
        </div>

        <div className="dash-promo-stats" role="list" aria-label="Offer statistics">
          <div className="dash-promo-stat" role="listitem">
            <span className="dash-promo-stat-val">{offerCount}</span>
            <span className="dash-promo-stat-label">Active offers</span>
          </div>
          <div className="dash-promo-stat dash-promo-stat--mid" role="listitem">
            <span className="dash-promo-stat-val">{bonusCount}</span>
            <span className="dash-promo-stat-label">With bonuses</span>
          </div>
          <div className="dash-promo-stat" role="listitem">
            <span className="dash-promo-stat-val">24/7</span>
            <span className="dash-promo-stat-label">Rewards</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PromotionsQuestStrip() {
  return (
    <section className="dash-promo-quests dash-animate-in dash-delay-1" aria-label="Earn more rewards">
      <div className="dash-section-head">
        <h2 className="dash-section-title">Boost Your Rewards</h2>
        <p className="dash-section-sub">Complete quests to unlock more bonuses</p>
      </div>
      <div className="dash-promo-quest-grid">
        {QUESTS.map((q, i) => (
          <motion.div
            key={q.id}
            className={`dash-promo-quest dash-delay-${Math.min(i + 2, 6)}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.45 }}
          >
            <Link to={q.to} className="dash-promo-quest-link">
              <span className="dash-promo-quest-icon" aria-hidden>
                {q.icon}
              </span>
              <span className="dash-promo-quest-body">
                <span className="dash-promo-quest-label">{q.label}</span>
                <span className="dash-promo-quest-xp">{q.xp}</span>
              </span>
              <span className="dash-promo-quest-go" aria-hidden>
                →
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
