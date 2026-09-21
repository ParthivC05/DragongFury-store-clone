import { usePackageCountdown, usePackageCountdownParts } from '../../hooks/usePackageCountdown';
import { formatSc } from '../../utils/currency';
import { getDepositPackageImageProps } from '../../utils/depositPackageImage';
import { filterAvailablePackageGroups } from '../../utils/depositPackageAvailability';
import './deposit-packages.css';

const GROUP_THEME = {
  flash_sale: 'flash',
  welcome: 'welcome',
  featured: 'featured',
  limited_time: 'limited',
  general: 'general'
};

const SECTION_COPY = {
  flash: {
    subtitle: 'Limited-time deals — grab them before they\'re gone!',
    badge: null,
    live: true
  },
  welcome: {
    subtitle: 'Exclusive new-player deals — only available for 24 hours after signup',
    badge: '🎁 New player',
    live: false
  },
  featured: {
    subtitle: 'Hand-picked premium packages — best value picks',
    badge: '⭐ Featured',
    live: false
  },
  limited: {
    subtitle: 'Special offers ending soon — don\'t miss out',
    badge: '⏳ Limited',
    live: false
  },
  general: {
    subtitle: 'Standard packages — available anytime, no expiry',
    badge: '♾ Always on',
    live: false
  }
};

function splitUsdPrice(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return { dollars: '0', cents: '00' };
  const [whole, frac = '00'] = n.toFixed(2).split('.');
  return { dollars: whole, cents: frac };
}

function formatUsdStrike(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${formatSc(n)}`;
}

function savingsPercent(actual, final) {
  const a = Number(actual);
  const f = Number(final);
  if (!Number.isFinite(a) || !Number.isFinite(f) || a <= f || a <= 0) return null;
  return Math.round((1 - f / a) * 100);
}

function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
}

function resolveGroupEndsAt(group) {
  const fromGroup = group?.countdown_ends_at || group?.ends_at;
  if (fromGroup) return fromGroup;
  let soonest = null;
  let soonestMs = Infinity;
  for (const p of group?.packages || []) {
    const raw = p?.countdown_ends_at || p?.ends_at;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms) || ms <= Date.now()) continue;
    if (ms < soonestMs) {
      soonestMs = ms;
      soonest = raw;
    }
  }
  return soonest;
}

function FlashLiveTimer({ endsAt }) {
  const parts = usePackageCountdownParts(endsAt);
  if (!parts) return null;
  const units = [
    ['d', parts.days],
    ['h', parts.hours],
    ['m', parts.minutes],
    ['s', parts.seconds]
  ];
  return (
    <span className="pj-ac-cd" role="timer">
      <span className="pj-ac-cd-live">
        <span className="pj-ac-cd-dot" />
        LIVE
      </span>
      {units.map(([key, val]) => (
        <span className={`pj-ac-cd-unit${key === 's' ? ' is-sec' : ''}`} key={key}>
          <span className="pj-ac-cd-num">{pad2(val)}</span>
          <span className="pj-ac-cd-lab">{key}</span>
        </span>
      ))}
    </span>
  );
}

function CountdownBadge({ endsAt, variant = 'default' }) {
  const countdown = usePackageCountdown(endsAt);
  if (!countdown) return null;
  return (
    <span
      className={`dash-pkg-countdown dash-pkg-countdown--${variant}`}
      role="timer"
      aria-live="polite"
    >
      <span aria-hidden>⏱</span>
      {variant === 'flash' ? 'Ends ' : 'Ends in '}
      {countdown}
    </span>
  );
}

function PriceDisplay({ finalPrice, actualPrice, hideSave = false }) {
  const { dollars, cents } = splitUsdPrice(finalPrice);
  const savePct = savingsPercent(actualPrice, finalPrice);
  const showStrike = Number(actualPrice) > Number(finalPrice);

  return (
    <div className="dash-pkg-price-row">
      <div className="dash-pkg-price-main" aria-label={`Price $${dollars}.${cents}`}>
        <span className="dash-pkg-price-symbol">$</span>
        <span className="dash-pkg-price-dollars">{dollars}</span>
        <span className="dash-pkg-price-cents">.{cents}</span>
      </div>
      {showStrike && (
        <span className="dash-pkg-actual">
          <span className="dash-pkg-actual-symbol">$</span>
          {formatSc(actualPrice)}
        </span>
      )}
      {!hideSave && savePct != null && savePct > 0 && (
        <span className="dash-pkg-save-pill">Save {savePct}%</span>
      )}
    </div>
  );
}

function PackageCard({ pkg, theme, selected, onSelect, index }) {
  const endsAt = pkg.countdown_ends_at || pkg.ends_at;
  const cardCountdown = usePackageCountdown(endsAt);
  const staggerStyle = { animationDelay: `${Math.min(index, 6) * 0.07}s` };
  const imageAlt = pkg.title
    ? `${pkg.title} — ${formatSc(pkg.final_sc)} SC`
    : `${formatSc(pkg.final_sc)} SC package`;

  return (
    <button
      type="button"
      onClick={() => onSelect(pkg)}
      className={`dash-pkg-card dash-pkg-card--${theme} ${selected ? 'dash-pkg-card--active' : ''}`}
      style={staggerStyle}
      aria-pressed={selected}
    >
      <span className="dash-pkg-card-check" aria-hidden>✓</span>

      <div className="dash-pkg-card-image-wrap">
        {theme !== 'flash' && pkg.discount_label && (
          <span className="dash-pkg-badge">{pkg.discount_label}</span>
        )}
        <img
          {...getDepositPackageImageProps(index)}
          alt={imageAlt}
          className="dash-pkg-card-image"
        />
        <span className="dash-pkg-card-image-shine" aria-hidden />
      </div>

      <div className="dash-pkg-card-top">
        <div className="dash-pkg-sc-block">
          <span className="dash-pkg-sc-label">You get</span>
          <p className="dash-pkg-sc">{formatSc(pkg.final_sc)} SC</p>
        </div>
        {pkg.title && <p className="dash-pkg-title">{pkg.title}</p>}
      </div>

      <div className="dash-pkg-card-body">
        <PriceDisplay
          finalPrice={pkg.final_price}
          actualPrice={pkg.actual_price}
          hideSave={theme === 'flash'}
        />
        <div className="dash-pkg-card-footer">
          {endsAt && theme !== 'general' && theme !== 'flash' && cardCountdown && (
            <span className="dash-pkg-card-countdown">
              ⏱ {cardCountdown}
            </span>
          )}
        </div>
        <span className={`dash-pkg-card-cta ${theme === 'welcome' ? 'dash-pkg-card-cta--welcome' : ''}`}>
          {theme === 'welcome'
            ? (selected ? 'Selected ✓' : 'Claim offer')
            : (selected ? 'Selected ✓' : 'Tap to select')}
        </span>
      </div>
    </button>
  );
}

function WelcomeSparkles() {
  return (
    <div className="dash-pkg-welcome-sparkles" aria-hidden>
      <span className="dash-pkg-welcome-spark dash-pkg-welcome-spark--1">✦</span>
      <span className="dash-pkg-welcome-spark dash-pkg-welcome-spark--2">✨</span>
      <span className="dash-pkg-welcome-spark dash-pkg-welcome-spark--3">★</span>
      <span className="dash-pkg-welcome-spark dash-pkg-welcome-spark--4">✦</span>
      <span className="dash-pkg-welcome-spark dash-pkg-welcome-spark--5">🎉</span>
      <span className="dash-pkg-welcome-spark dash-pkg-welcome-spark--6">✨</span>
    </div>
  );
}

function PackageSectionHeader({ group, theme, hideCountdown = false }) {
  const copy = SECTION_COPY[theme] || SECTION_COPY.general;
  const sectionEndsAt = resolveGroupEndsAt(group);

  return (
    <header className="dash-pkg-section-head">
      <div className="dash-pkg-section-head-main">
        <div className="dash-pkg-section-title-row">
          <h2 className="dash-pkg-section-title">{group.title}</h2>
          {copy.live && (
            <span className="dash-pkg-live-badge">
              <span className="dash-pkg-live-dot" aria-hidden />
              Live sale
            </span>
          )}
          {!copy.live && copy.badge && (
            <span className={`dash-pkg-${theme}-badge`}>{copy.badge}</span>
          )}
        </div>
        <p className="dash-pkg-section-sub">{copy.subtitle}</p>
      </div>
      {sectionEndsAt && !hideCountdown && (
        theme === 'flash'
          ? <FlashLiveTimer endsAt={sectionEndsAt} />
          : <CountdownBadge endsAt={sectionEndsAt} variant={theme} />
      )}
    </header>
  );
}

/**
 * Step 1 of package-first deposit: pick a package from themed grouped sections.
 */
export function DepositPackageStep({
  groups,
  currency: _currency,
  selectedPackage,
  onSelectPackage,
  loading = false
}) {
  const visibleGroups = filterAvailablePackageGroups(groups);

  if (loading && !visibleGroups.length) {
    return (
      <section className="dash-panel min-w-0">
        <p className="dash-empty-state">Loading deposit packages…</p>
      </section>
    );
  }

  if (!visibleGroups.length) {
    return (
      <section className="dash-panel min-w-0">
        <p className="dash-empty-state">No deposit packages available right now.</p>
      </section>
    );
  }

  return (
    <>
      {visibleGroups.map((group) => {
        const theme = GROUP_THEME[group.group_key] || 'general';
        const packages = group.packages || [];
        if (!packages.length) return null;

        return (
          <section
            key={group.id || group.group_key}
            className={`dash-pkg-section dash-pkg-section--${theme} dash-animate-in min-w-0${theme === 'welcome' ? ' dash-pkg-section--welcome-promo' : ''}`}
          >
            {theme === 'welcome' && <WelcomeSparkles />}
            <PackageSectionHeader group={group} theme={theme} hideCountdown={theme === 'welcome'} />
            <div className={`dash-pkg-grid dash-pkg-grid--${theme}`}>
              {packages.map((pkg, index) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  theme={theme}
                  index={index}
                  selected={selectedPackage?.id === pkg.id}
                  onSelect={onSelectPackage}
                />
              ))}
            </div>
            {theme === 'welcome' && (
              <div className="dash-pkg-welcome-footer">
                {(group.countdown_ends_at || group.ends_at) && (
                  <CountdownBadge
                    endsAt={group.countdown_ends_at || group.ends_at}
                    variant="welcome"
                  />
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
