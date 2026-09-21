import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

/** Darken a hex color by a factor (0–1). */
function darkenHex(hex, factor = 0.3) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#1a1a1f';
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - factor));
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - factor));
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - factor));
  return `rgb(${r},${g},${b})`;
}

const BONUS_TRIGGER_LABELS = {
  first_deposit: 'First deposit',
  second_deposit: 'Second deposit',
  third_deposit: 'Third deposit',
  welcome: 'Welcome',
  withdrawal_threshold: 'Withdrawal'
};

const RARITY_BY_TRIGGER = {
  first_deposit: { label: 'Legendary', icon: '🥇', className: 'dash-promo-rarity--legendary' },
  second_deposit: { label: 'Epic', icon: '💎', className: 'dash-promo-rarity--epic' },
  third_deposit: { label: 'Rare', icon: '⚡', className: 'dash-promo-rarity--rare' },
  welcome: { label: 'Welcome', icon: '🎉', className: 'dash-promo-rarity--welcome' },
  withdrawal_threshold: { label: 'Cashout', icon: '💸', className: 'dash-promo-rarity--cashout' }
};

/** Build a short bonus summary for display (e.g. "5% bonus on first deposit"). */
function getBonusSummary(promotion) {
  const trigger = promotion.bonus_trigger_type;
  const type = promotion.bonus_type;
  const value = promotion.bonus_value;
  const minAmount = promotion.min_trigger_amount;
  if (!trigger || value == null) return null;
  const triggerLabel = BONUS_TRIGGER_LABELS[trigger] || trigger;
  if (type === 'percentage') {
    const minText = minAmount > 0 ? ` (min. ${minAmount})` : '';
    return `${value}% bonus on ${triggerLabel.toLowerCase()}${minText}`;
  }
  if (type === 'fixed') {
    if (trigger === 'withdrawal_threshold' && minAmount > 0) {
      return `${value} bonus when you withdraw ${minAmount}+ in one go`;
    }
    const minText = minAmount > 0 ? ` when you deposit ${minAmount}+` : '';
    return `${value} bonus on ${triggerLabel.toLowerCase()}${minText}`;
  }
  return null;
}

/**
 * Single promotion card - renders from dynamic data.
 * Dashboard theme with gamification badges and motion.
 */
export function PromotionCard({ promotion, index = 0 }) {
  const {
    title,
    description,
    image,
    cta_text,
    cta_url,
    background_color,
    bonus_trigger_type
  } = promotion;

  const bonusSummary = getBonusSummary(promotion);
  const rarity = RARITY_BY_TRIGGER[bonus_trigger_type] || {
    label: 'Hot',
    icon: '🔥',
    className: 'dash-promo-rarity--hot'
  };

  const accent = background_color || '#9b59ff';
  const accentDark = darkenHex(accent.startsWith('#') ? accent : '#9b59ff', 0.45);
  const accentSafe = accent.startsWith('#') ? accent : '#9b59ff';
  const cardGradient = `linear-gradient(145deg, ${accentSafe}22 0%, rgba(13, 19, 32, 0.98) 42%, ${accentDark}55 100%)`;

  const ctaText = cta_text || 'Learn More';
  const ctaUrl = cta_url || '#';
  const isInternal = ctaUrl.startsWith('/') && !ctaUrl.startsWith('//');

  const CtaButton = () => {
    const className = 'dash-promo-card-cta';
    if (isInternal) {
      return (
        <Link to={ctaUrl} className={className}>
          {ctaText}
          <span className="dash-promo-card-cta-arrow" aria-hidden>
            →
          </span>
        </Link>
      );
    }
    return (
      <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className={className}>
        {ctaText}
        <span className="dash-promo-card-cta-arrow" aria-hidden>
          →
        </span>
      </a>
    );
  };

  return (
    <motion.article
      className="dash-promo-card"
      style={{
        '--promo-accent': accentSafe,
        background: cardGradient
      }}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: 0.08 + (index % 6) * 0.07,
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1]
      }}
      whileHover={{ y: -6, transition: { duration: 0.25 } }}
    >
      <div className="dash-promo-card-shine" aria-hidden />
      <div
        className="dash-promo-card-glow"
        style={{ background: accentSafe }}
        aria-hidden
      />
      <div className="dash-promo-card-border" aria-hidden />

      <span className={`dash-promo-rarity ${rarity.className}`}>
        <span aria-hidden>{rarity.icon}</span>
        {rarity.label}
      </span>

      <div className="dash-promo-card-body">
        <div className="dash-promo-card-main">
          {image && (
            <motion.div
              className="dash-promo-card-img-wrap"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.2 }}
            >
              <img src={image} alt="" className="dash-promo-card-img" />
            </motion.div>
          )}
          <div className="dash-promo-card-copy">
            <h3 className="dash-promo-card-title">{title}</h3>
            <p className="dash-promo-card-desc">{description}</p>
            {bonusSummary && (
              <p className="dash-promo-card-bonus">
                <span className="dash-promo-card-bonus-icon" aria-hidden>
                  ✓
                </span>
                {bonusSummary}
              </p>
            )}
          </div>
        </div>
        <div className="dash-promo-card-footer">
          <CtaButton />
        </div>
      </div>
    </motion.article>
  );
}
