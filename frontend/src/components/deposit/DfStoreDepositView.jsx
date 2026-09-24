import { useEffect, useMemo, useState } from 'react';
import { usePackageCountdownParts } from '../../hooks/usePackageCountdown';
import { isCryptoDepositRail } from '../../utils/depositRails';
import {
  resolveChestTier,
  resolveLimitedChestFile,
  chestImageProps,
  packBonusParts,
  formatMoney,
  formatScLabel
} from '../../utils/storeChest';
import { DfStorePaymentModal } from './DfStorePaymentModal';
import './df-store.css';

function groupTheme(group) {
  const k = String(group?.group_key || '').toLowerCase();
  if (k === 'flash_sale' || k.includes('flash')) return 'flash';
  if (k === 'limited_time' || k.includes('limited')) return 'limited';
  return 'general';
}

function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
}

function RefreshTimer({ endsAt }) {
  const parts = usePackageCountdownParts(endsAt);
  if (!parts) return null;
  const label =
    parts.days > 0
      ? `${parts.days}:${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
      : `${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`;
  return (
    <div className="df-store-limited-timer" role="timer" aria-live="off" aria-label={`Offers refresh in ${label}`}>
      <small>Refreshes in</small>
      <strong>{label}</strong>
    </div>
  );
}

function offerBadge(pkg, pct) {
  const label = String(pkg?.discount_label || pkg?.badge || '').trim();
  if (label) return label;
  if (pct > 0) return `+${pct}% SC`;
  return null;
}

function LimitedCard({ pkg, selected, onSelect, index }) {
  const { sc, base, bonus, pct } = packBonusParts(pkg);
  const file = resolveLimitedChestFile(pkg);
  const price = formatMoney(pkg.final_price);
  const badge = offerBadge(pkg, pct);
  const listPrice = Number(pkg.actual_price ?? pkg.actualPrice);
  const showList = Number.isFinite(listPrice) && listPrice > Number(pkg.final_price) + 0.009;

  return (
    <article
      className={`store-limited-package${selected ? ' is-on' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
    >
      {badge ? <span className="store-limited-package__badge">{badge}</span> : null}
      <span className="sc-offer-amount" data-sc-offer-amount="true">
        <strong className="sc-offer-amount__total">{formatScLabel(sc)}</strong>
        <span className="sc-offer-amount__breakdown">
          {base.toFixed(2)} base{bonus > 0 ? ` + ${bonus.toFixed(2)} bonus` : ''}
        </span>
      </span>
      <div className="store-limited-package__art" aria-hidden>
        <img className="df-store-chest-image" {...chestImageProps(file, { eager: index < 2 })} />
      </div>
      <span
        className="dragonfury-offer-prices dragonfury-offer-prices--compact"
        aria-label={showList ? `Was ${formatMoney(listPrice)}. Price ${price}.` : `Price ${price}.`}
      >
        <span className="dragonfury-offer-price dragonfury-offer-price--offer">
          <small>Price</small>
          {showList ? <del>{formatMoney(listPrice)}</del> : null}
          <strong>{price}</strong>
        </span>
      </span>
      <button
        className="df-store-price-button"
        type="button"
        aria-label={`Buy ${formatScLabel(sc)}. Offer price ${price}`}
        onClick={() => onSelect(pkg)}
      >
        {price}
        <span>Choose chest</span>
      </button>
    </article>
  );
}

function ChestCard({ pkg, selected, onSelect, index, compact }) {
  const chest = resolveChestTier(pkg);
  const { sc, base, bonus } = packBonusParts(pkg);
  const price = formatMoney(pkg.final_price);
  const title = /chest/i.test(String(pkg.title || '')) ? pkg.title : chest.label;

  return (
    <article
      className={`store-package-card df-store-card${compact ? ' df-store-card--compact' : ''}${selected ? ' is-on' : ''}`}
      data-chest-tier={chest.tier}
      style={{
        '--chest-scale': chest.scale,
        '--chest-glow': chest.glow,
        '--chest-delay': `${Math.min(index, 8) * 50}ms`
      }}
    >
      <span className="df-store-card__rarity">{chest.rarity}</span>
      <div className="store-package-card__art df-store-card__art" aria-hidden>
        <img
          className="df-store-chest-image"
          {...chestImageProps(chest.file, { eager: index < 4 })}
        />
      </div>
      <div className="df-store-card__details">
        <h3>{title}</h3>
        <span className="sc-offer-amount df-store-card__amount" data-sc-offer-amount="true">
          <strong className="sc-offer-amount__total">{formatScLabel(sc)}</strong>
          <span className="sc-offer-amount__breakdown">
            {base.toFixed(2)} base{bonus > 0 ? ` + ${bonus.toFixed(2)} bonus` : ''}
          </span>
        </span>
      </div>
      <span className="df-store-card__price" aria-hidden>
        {price}
        <span>Choose chest</span>
      </span>
      <button
        className="df-store-card__select"
        type="button"
        aria-label={`Buy ${title}: ${formatScLabel(sc)} for ${price}`}
        aria-pressed={selected}
        onClick={() => onSelect(pkg)}
      />
    </article>
  );
}

/**
 * Dragon Fury /store UI: chest packages only; payment method opens in a popup (live parity).
 */
export function DfStoreDepositView({
  rails = [],
  amountBounds = { min: 0, max: Infinity },
  selectedRail = null,
  onSelectRail,
  openPacks = [],
  packageGroups = [],
  packagesLoading = false,
  selectedPackage = null,
  onSelectPackage,
  customAmountMode = false,
  canSubmit = false,
  submitting = false,
  onPay,
  cryptoStepPending = false,
  extraFields = null,
  afterMethodFields = null
}) {
  const [modalPkg, setModalPkg] = useState(null);
  const [awaitingPay, setAwaitingPay] = useState(false);

  const displayGroups = useMemo(() => {
    const source =
      Array.isArray(packageGroups) && packageGroups.length > 0
        ? packageGroups
        : [{ group_key: 'general', title: 'Packages', packages: openPacks }];
    return source.filter((g) => (g.packages || []).length > 0);
  }, [packageGroups, openPacks]);

  const { limitedPacks, limitedEndsAt, primaryPacks, morePacks } = useMemo(() => {
    const limited = [];
    const regular = [];
    const used = new Set();

    for (const g of displayGroups) {
      const theme = groupTheme(g);
      for (const p of g.packages || []) {
        const id = p.id;
        if (id == null || used.has(String(id))) continue;
        used.add(String(id));
        if (theme === 'flash' || theme === 'limited') limited.push(p);
        else regular.push(p);
      }
    }

    if (!limited.length && !regular.length && openPacks?.length) {
      regular.push(...openPacks);
    }

    const sortedLimited = [...limited].sort(
      (a, b) => Number(a.final_price) - Number(b.final_price)
    );

    const tierOrder = ['starter', 'premium', 'royal', 'epic', 'legendary', 'mythic'];
    const primary = [];
    const more = [];
    const usedTier = new Set();
    for (const pkg of regular) {
      const tier = resolveChestTier(pkg).tier;
      if (!usedTier.has(tier) && tierOrder.includes(tier)) {
        usedTier.add(tier);
        primary.push(pkg);
      } else {
        more.push(pkg);
      }
    }
    primary.sort(
      (a, b) => tierOrder.indexOf(resolveChestTier(a).tier) - tierOrder.indexOf(resolveChestTier(b).tier)
    );
    more.sort((a, b) => Number(a.final_price) - Number(b.final_price));

    let endsAt = null;
    let soonest = Infinity;
    for (const g of displayGroups) {
      const raw = g?.countdown_ends_at || g?.ends_at;
      if (!raw) continue;
      const ms = new Date(raw).getTime();
      if (Number.isFinite(ms) && ms > Date.now() && ms < soonest) {
        soonest = ms;
        endsAt = raw;
      }
    }
    if (!endsAt) {
      for (const p of sortedLimited) {
        const raw = p?.countdown_ends_at || p?.ends_at;
        if (!raw) continue;
        const ms = new Date(raw).getTime();
        if (Number.isFinite(ms) && ms > Date.now() && ms < soonest) {
          soonest = ms;
          endsAt = raw;
        }
      }
    }
    return {
      limitedPacks: sortedLimited,
      limitedEndsAt: endsAt,
      primaryPacks: primary,
      morePacks: more
    };
  }, [displayGroups, openPacks]);

  function handlePackSelect(pkg) {
    setModalPkg(pkg);
    onSelectPackage?.(pkg);
  }

  function handleModalContinue(rail, pkg) {
    onSelectPackage?.(pkg);
    onSelectRail?.(rail);
    setModalPkg(null);
    if (isCryptoDepositRail(rail)) {
      setAwaitingPay(false);
      window.setTimeout(() => {
        document.getElementById('deposit-crypto-network')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('deposit-crypto-asset')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return;
    }
    setAwaitingPay(true);
  }

  useEffect(() => {
    if (!awaitingPay) return undefined;
    if (submitting) return undefined;
    if (!selectedPackage?.id || !selectedRail) return undefined;
    if (cryptoStepPending) {
      setAwaitingPay(false);
      return undefined;
    }
    if (!canSubmit) return undefined;
    const id = window.setTimeout(() => {
      setAwaitingPay(false);
      onPay?.();
    }, 60);
    return () => window.clearTimeout(id);
  }, [
    awaitingPay,
    selectedPackage?.id,
    selectedRail,
    canSubmit,
    cryptoStepPending,
    submitting,
    onPay
  ]);

  const showCryptoExtras = Boolean(selectedRail && isCryptoDepositRail(selectedRail) && selectedPackage);

  return (
    <section className="store-route-page store-route-page--premium df-store-page" aria-label="Store">
      <header className="df-store-heading">
        <p>DRAGON FURY SHOP</p>
        <h1>Choose your chest</h1>
        <span>SC packages for your next session.</span>
      </header>

      {packagesLoading && !primaryPacks.length && !limitedPacks.length ? (
        <p className="df-store-empty">Loading chests…</p>
      ) : null}

      {limitedPacks.length ? (
        <section className="df-store-limited-section" aria-labelledby="store-limited-offers-title">
          <h2 id="store-limited-offers-title" className="df-store-welcome-title">
            Limited Time Offer
          </h2>
          <div className="store-limited-offers">
            {limitedEndsAt ? <RefreshTimer endsAt={limitedEndsAt} /> : null}
            <div className="store-limited-offers__scroll" aria-label="Active limited-time packages">
              {limitedPacks.map((pkg, i) => (
                <LimitedCard
                  key={pkg.id}
                  pkg={pkg}
                  index={i}
                  selected={!customAmountMode && selectedPackage?.id === pkg.id}
                  onSelect={handlePackSelect}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {primaryPacks.length || morePacks.length ? (
        <section
          className="df-store-all-section store-quick-buy"
          aria-label="ALL PACKAGES"
          aria-labelledby="store-regular-offers-title"
        >
          <h2 className="store-route-title" id="store-regular-offers-title">
            All Packages
          </h2>
          <div className="store-package-grid df-store-grid" data-onboarding-anchor="store-packages">
            {primaryPacks.map((pkg, i) => (
              <ChestCard
                key={pkg.id}
                pkg={pkg}
                index={i}
                selected={!customAmountMode && selectedPackage?.id === pkg.id}
                onSelect={handlePackSelect}
              />
            ))}
          </div>
          {morePacks.length ? (
            <details className="df-store-additional">
              <summary>More packages</summary>
              <div className="store-package-grid df-store-grid" aria-label="More SC packages">
                {morePacks.map((pkg, i) => (
                  <ChestCard
                    key={pkg.id}
                    pkg={pkg}
                    index={i}
                    compact
                    selected={!customAmountMode && selectedPackage?.id === pkg.id}
                    onSelect={handlePackSelect}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {!packagesLoading && !primaryPacks.length && !limitedPacks.length ? (
        <p className="df-store-empty">No packages available right now.</p>
      ) : null}

      {showCryptoExtras ? (
        <div className="df-store-pay" id="deposit-pay-methods">
          <h2 className="df-store-pay__title">Complete crypto details</h2>
          <p className="df-store-pay__lede">Pick your coin and network to finish checkout.</p>
          {afterMethodFields}
          {extraFields}
          <div className="df-store-cta" style={{ position: 'static' }}>
            <button
              type="button"
              className="df-store-price-button"
              disabled={submitting || !canSubmit}
              onClick={() => onPay?.()}
            >
              {submitting ? 'Processing…' : 'Continue to pay'}
            </button>
          </div>
        </div>
      ) : null}

      <DfStorePaymentModal
        open={Boolean(modalPkg)}
        package={modalPkg}
        rails={rails}
        amountBounds={amountBounds}
        selectedRail={selectedRail}
        submitting={submitting || awaitingPay}
        onClose={() => setModalPkg(null)}
        onSelectRail={onSelectRail}
        onContinue={handleModalContinue}
      />
    </section>
  );
}
