import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PayPalIcon,
  PaymentCardIcon,
  ApplePayIcon,
  GooglePayIcon,
  CashAppIcon,
  CryptoPayIcon
} from '../../assets/icons';
import { getDepositPackageImageProps } from '../../utils/depositPackageImage';
import { formatSc, constrainAmountInput } from '../../utils/currency';
import { usePackageCountdownParts } from '../../hooks/usePackageCountdown';
import {
  railNote,
  railCustomCopy,
  packSavePercent,
  packBadgeClass,
  buildDummyRecentPurchases,
  formatHistoryStamp,
  isChimeManualRail,
  isCryptoDirectRail,
  isCryptoDepositRail,
  cryptoCoinMeta
} from '../../utils/depositRails';
import { site } from '../../config/site';
import { ChimeLogo } from '../payment/ChimeLogo';
import { CoinMark } from './CryptoCurrencyPicker';
import './add-coins-deposit.css';

function ChimeMark({ color }) {
  return <ChimeLogo className="lw-ac-chime-word" color={color} />;
}

function VenmoMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="#008CFF"
        d="M19.6 3.1c-1.5 2.2-2.4 4.4-2.4 7.1 0 4.6 2.3 7.9 5.5 10.2h-6.4C13.5 18 11.6 14.1 11.6 8.8c0-2.5.7-4.9 1.9-7h6.1zM8.3 20.4H2.1L6.8 3.8h6.3L8.3 20.4z"
      />
    </svg>
  );
}

function ZelleMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#6D1ED4" />
      <path
        fill="#fff"
        d="M9.2 8.4h13.1c.55 0 .9.55.66 1.03L16.2 21.2h5.9c.5 0 .9.4.9.9v1.5c0 .5-.4.9-.9.9H9.1c-.55 0-.9-.55-.66-1.03L15.2 10.8H9.2c-.5 0-.9-.4-.9-.9V9.3c0-.5.4-.9.9-.9z"
      />
    </svg>
  );
}

function BankMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
      <path d="M3 10.5 12 4l9 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5 10.5V18h14v-7.5M3 19h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const RAIL_ICONS = {
  card: PaymentCardIcon,
  credit_card: PaymentCardIcon,
  debit_card: PaymentCardIcon,
  cashapp: CashAppIcon,
  chime: ChimeMark,
  apple_pay: ApplePayIcon,
  google_pay: GooglePayIcon,
  crypto: CryptoPayIcon,
  paypal: PayPalIcon,
  venmo: VenmoMark,
  zelle: ZelleMark,
  bank_transfer: BankMark
};

const RAIL_TILE = {
  card: { bg: '#fff', color: '#1A1F71' },
  credit_card: { bg: '#fff', color: '#1A1F71' },
  debit_card: { bg: '#fff', color: '#1A1F71' },
  cashapp: { bg: '#00D54B', color: '#fff' },
  chime: { bg: '#1EC677', color: '#fff' },
  apple_pay: { bg: '#000', color: '#fff' },
  google_pay: { bg: '#fff', color: '#3C4043' },
  crypto: { bg: '#1B1030', color: '#fff' },
  paypal: { bg: '#fff', color: '#003087' },
  venmo: { bg: '#008CFF', color: '#fff' },
  zelle: { bg: '#6D1ED4', color: '#fff' },
  bank_transfer: { bg: '#fff', color: '#111726' }
};

function PayCtaButton({ className, disabled, onClick, big, sm, tabIndex }) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onClick}
      tabIndex={tabIndex}
    >
      <span className="pj-ac-cta-l1">{big}</span>
      {sm ? <span className="pj-ac-cta-l2">{sm}</span> : null}
    </button>
  );
}

function sanitizePackTitle(title) {
  return String(title || '')
    .replace(/\bGCs?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0.00';
  return `$${formatSc(v)}`;
}

function formatScAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function historyStatus(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'ok') return ['ok', 'COMPLETED'];
  if (s === 'pending' || s === 'processing' || s === 'submitted' || s === 'link_created') {
    return ['pend', 'PENDING'];
  }
  if (s === 'refunded' || s === 'refund') return ['dead', 'REFUNDED'];
  return ['dead', String(s || 'EXPIRED').toUpperCase()];
}

function resolveIconKey(railKey, paymentKey) {
  const rail = String(railKey || '').toLowerCase();
  const pay = String(paymentKey || '').toLowerCase().replace(/-/g, '_');
  if (rail.startsWith('chime') || pay.startsWith('chime')) return 'chime';
  return pay;
}

function groupTheme(group) {
  const k = String(group?.group_key || '').toLowerCase();
  if (k === 'flash_sale' || k.includes('flash')) return 'flash';
  if (k === 'welcome') return 'welcome';
  if (k === 'featured') return 'featured';
  if (k === 'limited_time') return 'limited';
  return 'general';
}

function packEconomics(pkg) {
  const sc = Number(pkg?.final_sc);
  const price = Number(pkg?.final_price);
  const was = Number(pkg?.actual_price);
  const savePct = packSavePercent(pkg);
  const freeAmt = was > price ? was - price : (sc > price ? sc - price : 0);
  return { sc, price, was, savePct, freeAmt };
}

function RailBrand({ railKey, paymentKey, label, boxed }) {
  const iconKey = resolveIconKey(railKey, paymentKey);
  const Icon = RAIL_ICONS[iconKey];
  const tile = RAIL_TILE[iconKey] || { bg: '#fff', color: '#111' };
  const iconProps = iconKey === 'chime' ? { color: boxed ? tile.color : undefined } : {};
  const inner = boxed && iconKey === 'cashapp'
    ? (
      <svg className="pj-ac-cash-mark" viewBox="0 0 24 24" aria-hidden>
        <text x="12" y="17.5" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="800">$</text>
      </svg>
    )
    : Icon
      ? <Icon {...iconProps} />
      : <span>{(paymentKey || '?').charAt(0).toUpperCase()}</span>;
  if (!boxed) {
    return (
      <span className="lw-ac-brandbox" aria-label={label || undefined}>
        {inner}
      </span>
    );
  }
  return (
    <span className="pj-ac-lg" style={{ background: tile.bg, color: tile.color }} aria-label={label || undefined}>
      {inner}
    </span>
  );
}

function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
}

function PackCountdown({ endsAt, variant = 'default' }) {
  const parts = usePackageCountdownParts(endsAt);
  if (!parts) return null;
  if (variant === 'flash') {
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
  const label = parts.days > 0
    ? `${parts.days}d ${pad2(parts.hours)}h ${pad2(parts.minutes)}m ${pad2(parts.seconds)}s`
    : parts.hours > 0
      ? `${pad2(parts.hours)}h ${pad2(parts.minutes)}m ${pad2(parts.seconds)}s`
      : `${parts.minutes}m ${pad2(parts.seconds)}s`;
  return <span className="pj-ac-timer">{label}</span>;
}

function PackCard({ pkg, index, selected, locked, rib, onSelect }) {
  const { sc, price, was, savePct, freeAmt } = packEconomics(pkg);
  const badge = pkg.discount_label || null;
  const badgeCls = packBadgeClass(pkg);

  return (
    <button
      type="button"
      className={`pj-ac-pk${locked ? ' lk' : ''}${selected ? ' on' : ''}${badgeCls ? ` ${badgeCls}` : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(pkg)}
    >
      {rib ? <span className={`pj-ac-rib ${rib.cls}`}>{rib.text}</span> : null}
      {!rib && badge ? <span className="pj-ac-rib pop">{String(badge).toUpperCase()}</span> : null}
      <span className="pj-ac-tick">✓</span>
      <span className="pj-ac-stage">
        <img {...getDepositPackageImageProps(index)} alt="" />
      </span>
      <span className="pj-ac-coins">{formatScAmount(sc)}</span>
      <span className="pj-ac-unit">SWEEPS COINS</span>
      {sanitizePackTitle(pkg.title) ? <span className="pj-ac-title">{sanitizePackTitle(pkg.title)}</span> : null}
      <span className="pj-ac-price">{money(price)}</span>
      {was > price ? <span className="pj-ac-was">{money(was)}</span> : null}
      {freeAmt > 0 ? <span className="pj-ac-free">+{money(freeAmt)} free</span> : null}
      {savePct > 0 && !rib ? <span className="pj-ac-rib save">SAVE {savePct}%</span> : null}
    </button>
  );
}

function FlashCard({ pkg, index, selected, locked, onSelect }) {
  const { sc, price, was, freeAmt } = packEconomics(pkg);
  return (
    <button
      type="button"
      className={`pj-ac-flash${locked ? ' lk' : ''}${selected ? ' on' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(pkg)}
    >
      <span className="pj-ac-flash-stage">
        <img {...getDepositPackageImageProps(index)} alt="" />
      </span>
      <span className="pj-ac-flash-info">
        <span className="pj-ac-flash-coins">{formatScAmount(sc)}</span>
        <span className="pj-ac-unit">SWEEPS COINS</span>
        {freeAmt > 0 ? (
          <span className="pj-ac-free">🎁 +{money(freeAmt)} free value included</span>
        ) : null}
      </span>
      <span className="pj-ac-flash-buy">
        <span className="pj-ac-flash-price">{money(price)}</span>
        {was > price ? <span className="pj-ac-was">{money(was)}</span> : null}
        <span className="pj-ac-flash-cta">{locked ? '🔒 Unlock' : selected ? '✓ Selected' : 'Get this'}</span>
      </span>
    </button>
  );
}

export function AddCoinsDepositView({
  rails = [],
  selectedRail = null,
  onSelectRail,
  openPacks = [],
  packageGroups = [],
  packagesLoading = false,
  selectedPackage = null,
  onSelectPackage,
  customAmounts = [],
  customAmountMode = false,
  selectedAmount = null,
  customAmount = '',
  customAmountError = '',
  onSelectCustomAmount,
  onCustomAmountChange,
  allowCustomField = false,
  extraFields = null,
  afterMethodFields = null,
  applicableVouchers = [],
  selectedVoucherId = null,
  onSelectVoucher,
  payableAmount = 0,
  creditSc = 0,
  selectedPaymentLabel = '',
  canSubmit = false,
  submitting = false,
  useChimeManualFlow = false,
  onPay,
  purchases = [],
  onRefreshPurchases,
  syncing = false,
  closingSyncing = false,
  onRetryPurchase,
  currency = 'SC',
  cryptoStepPending = false
}) {
  void selectedPaymentLabel;
  void useChimeManualFlow;
  void currency;
  void onRetryPurchase;

  const [showAllHist, setShowAllHist] = useState(false);
  const [tick, setTick] = useState(0);
  const [inlineCtaVisible, setInlineCtaVisible] = useState(false);
  const [missedPack, setMissedPack] = useState(null);
  const [portalEl, setPortalEl] = useState(() => document.querySelector('.dash-root'));
  const inlineBarRef = useRef(null);
  const overlayBarRef = useRef(null);
  const packSectionRef = useRef(null);
  const methodsRef = useRef(null);
  const pendingPackRef = useRef(null);
  const lastRailKeyRef = useRef(selectedRail?.railKey || null);
  const lastCryptoPromptKeyRef = useRef('');

  const locked = !selectedRail;

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 8000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const root = document.querySelector('.dash-root');
    if (root && root !== portalEl) setPortalEl(root);
  }, [portalEl]);

  function scrollToCryptoNetwork() {
    const el = document.getElementById('deposit-crypto-network') || document.getElementById('deposit-crypto-asset');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToPacks() {
    packSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    const next = selectedRail?.railKey || null;
    const prev = lastRailKeyRef.current;
    lastRailKeyRef.current = next;
    if (!next || next === prev) return undefined;
    lastCryptoPromptKeyRef.current = '';
    const cryptoRail = isCryptoDepositRail(selectedRail);
    const id = window.setTimeout(() => {
      if (cryptoRail && payableAmount && cryptoStepPending) scrollToCryptoNetwork();
      else scrollToPacks();
    }, 120);
    return () => window.clearTimeout(id);
  }, [selectedRail?.railKey, selectedRail, payableAmount, cryptoStepPending]);

  useEffect(() => {
    if (!isCryptoDepositRail(selectedRail) || !payableAmount || !cryptoStepPending) return undefined;
    const key = `${selectedRail?.railKey || ''}|${selectedPackage?.id || ''}|${customAmountMode ? 'c' : 'p'}`;
    if (lastCryptoPromptKeyRef.current === key) return undefined;
    lastCryptoPromptKeyRef.current = key;
    const id = window.setTimeout(() => scrollToCryptoNetwork(), 180);
    return () => window.clearTimeout(id);
  }, [selectedRail, selectedRail?.railKey, payableAmount, cryptoStepPending, selectedPackage?.id, customAmountMode]);

  useEffect(() => {
    const pending = pendingPackRef.current;
    if (!selectedRail || pending == null) return;
    const hit = (openPacks || []).find((p) => Number(p.id) === Number(pending.id));
    if (hit) {
      pendingPackRef.current = null;
      setMissedPack(null);
      onSelectPackage?.(hit);
      return;
    }
    if ((openPacks || []).length > 0 || !packagesLoading) {
      pendingPackRef.current = null;
      setMissedPack(pending);
    }
  }, [selectedRail, openPacks, onSelectPackage, packagesLoading]);

  useEffect(() => {
    if (!portalEl) return undefined;
    const inline = inlineBarRef.current;
    const overlay = overlayBarRef.current;
    if (!inline || !overlay) return undefined;

    let raf = 0;
    const sync = () => {
      raf = 0;
      const inlineTop = inline.getBoundingClientRect().top;
      const overlayTop = overlay.getBoundingClientRect().top;
      setInlineCtaVisible((prev) => {
        if (prev) return inlineTop <= overlayTop + 8;
        return inlineTop <= overlayTop + 1;
      });
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(inline);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [portalEl]);

  const dummyRecent = useMemo(
    () => buildDummyRecentPurchases(openPacks.length ? openPacks : flattenGroups(packageGroups), tick).slice(0, 3),
    [openPacks, packageGroups, tick]
  );

  const liveToday = 100 + ((new Date().getDate() * 7) % 80) + (tick % 5);

  const displayGroups = useMemo(() => {
    const source = Array.isArray(packageGroups) && packageGroups.length > 0
      ? packageGroups
      : [{ group_key: 'general', title: 'Packages', packages: openPacks }];
    return source.filter((g) => (g.packages || []).length > 0);
  }, [packageGroups, openPacks]);

  const { flashPack, flashRestPacks, welcomePacks, featuredPacks, limitedPacks, generalPacks, flashGroup, welcomeGroup, featuredGroup, limitedGroup, bestId } = useMemo(() => {
    const flashGroups = displayGroups.filter((g) => groupTheme(g) === 'flash');
    const welcomeGroups = displayGroups.filter((g) => groupTheme(g) === 'welcome');
    const featuredGroups = displayGroups.filter((g) => groupTheme(g) === 'featured');
    const limitedGroups = displayGroups.filter((g) => groupTheme(g) === 'limited');
    const generalGroups = displayGroups.filter((g) => groupTheme(g) === 'general');
    const flashList = flashGroups.flatMap((g) => g.packages || []);
    const flash = flashList[0] || null;
    const flashRest = flashList.slice(1);
    const used = new Set(flashList.map((p) => Number(p.id)).filter(Number.isFinite));
    const welcome = welcomeGroups.flatMap((g) => g.packages || []).filter((p) => !used.has(Number(p.id)));
    welcome.forEach((p) => used.add(Number(p.id)));
    const featured = featuredGroups.flatMap((g) => g.packages || []).filter((p) => !used.has(Number(p.id)));
    featured.forEach((p) => used.add(Number(p.id)));
    const limited = limitedGroups
      .filter((g) => String(g.group_key || '').toLowerCase() === 'limited_time')
      .flatMap((g) => g.packages || [])
      .filter((p) => !used.has(Number(p.id)));
    limited.forEach((p) => used.add(Number(p.id)));
    const general = generalGroups.flatMap((g) => g.packages || []).filter((p) => !used.has(Number(p.id)));
    const pool = [...flashList, ...welcome, ...featured, ...limited, ...general];
    let best = null;
    let bestPer = Infinity;
    for (const p of pool) {
      const sc = Number(p.final_sc);
      const price = Number(p.final_price);
      if (!(sc > 0) || !(price > 0)) continue;
      const per = price / sc;
      if (per < bestPer) {
        bestPer = per;
        best = p.id;
      }
    }
    return {
      flashPack: flash,
      flashRestPacks: flashRest,
      welcomePacks: welcome,
      featuredPacks: featured,
      limitedPacks: limited,
      generalPacks: general,
      flashGroup: flashGroups[0] || null,
      welcomeGroup: welcomeGroups[0] || null,
      featuredGroup: featuredGroups[0] || null,
      limitedGroup: limitedGroups[0] || null,
      bestId: best
    };
  }, [displayGroups]);

  const note = railNote(selectedRail);
  const customCopy = railCustomCopy(selectedRail);

  const histRows = purchases;
  const visibleHistRows = showAllHist ? histRows : histRows.slice(0, 4);

  const ctaDisabled = submitting || !(canSubmit || (cryptoStepPending && payableAmount));
  const ctaBig = !selectedRail
    ? 'Pick a payment method'
    : !payableAmount
      ? 'Now choose a package'
      : cryptoStepPending
        ? 'Now pick coin & network'
        : submitting
          ? 'Processing…'
          : `Pay ${money(payableAmount)} — get ${formatScAmount(creditSc)} coins`;
  const dockLine = !selectedRail
    ? 'Step 1 of 3 — choose how you pay'
    : !payableAmount
      ? `${selectedRail.label} selected · step 2 of 3`
      : cryptoStepPending
        ? `${selectedRail.label} selected · pick coin & network`
        : `${selectedRail.label} · ${selectedRail.speed || 'Instant'} · nothing charged until you tap`;
  const ctaReady = Boolean(selectedRail && payableAmount && !submitting);

  function scrollToMethods() {
    methodsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handlePackSelect(pkg) {
    if (!selectedRail) {
      pendingPackRef.current = pkg;
      setMissedPack(null);
      scrollToMethods();
      return;
    }
    setMissedPack(null);
    onSelectPackage?.(pkg);
  }

  const chosenEco = selectedPackage && !customAmountMode ? packEconomics(selectedPackage) : null;

  function handlePay() {
    if (submitting) return;
    if (cryptoStepPending) {
      scrollToCryptoNetwork();
      return;
    }
    if (!canSubmit) return;
    onPay?.();
  }

  const step1Done = Boolean(selectedRail);
  const step2Done = Boolean(selectedPackage && !customAmountMode);
  const step3Done = Boolean(customAmountMode && payableAmount);

  return (
    <>
      <section className="pj-ac-sec" id="deposit-pay-methods" ref={methodsRef}>
        <div className="pj-ac-sec-top">
          <span className={`pj-ac-badge${step1Done ? ' ok' : ''}`}>{step1Done ? 'STEP 1 ✓' : 'STEP 1'}</span>
          <h2>How are you paying?</h2>
          <p className="pj-ac-lede">Tap one. Nothing is charged yet.</p>
        </div>
        <div className="pj-ac-mgrid onboarding-payment-methods">
          {rails.map((rail) => (
            <button
              key={rail.railKey}
              type="button"
              className={`pj-ac-mth${selectedRail?.railKey === rail.railKey ? ' on' : ''}`}
              aria-pressed={selectedRail?.railKey === rail.railKey}
              onClick={() => {
                if (selectedRail?.railKey === rail.railKey) {
                  if (isCryptoDepositRail(rail) && cryptoStepPending && payableAmount) scrollToCryptoNetwork();
                  else scrollToPacks();
                  return;
                }
                onSelectRail?.(rail);
              }}
            >
              {rail.bestDeal ? (
                <span className="pj-ac-flag">BEST DEALS</span>
              ) : null}
              <span className="pj-ac-tick">✓</span>
              <RailBrand boxed railKey={rail.railKey} paymentKey={rail.key} />
              <span>
                <span className="pj-ac-nm">{rail.label}</span>
                <span className={`pj-ac-sp${String(rail.speed || '').includes('min') ? ' slow' : ''}`}>
                  {rail.speed || 'Instant'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="pj-ac-trust">
          <div className="pj-ac-trust-i">🛡️</div>
          <div>
            <b>We never store your card details</b>
            <span>Handled by a PCI Level 1 provider.</span>
          </div>
          <div className="pj-ac-seals">
            <div><b>SSL</b>SECURED</div>
            <div><b>PCI</b>LEVEL 1</div>
            <div><b>3DS</b>VERIFIED</div>
          </div>
        </div>
      </section>

      {afterMethodFields}

      <section className="pj-ac-sec" id="deposit-pack-section" ref={packSectionRef}>
        <div className="pj-ac-sec-top">
          <span className={`pj-ac-badge${step2Done ? ' ok' : locked ? ' off' : ''}`}>
            {step2Done ? 'STEP 2 ✓' : 'STEP 2'}
          </span>
          <h2>Choose your package</h2>
          <p className="pj-ac-lede">
            {selectedRail
              ? `These are the packages ${selectedRail.label} can collect.`
              : 'Browse now. Pick a payment method to unlock.'}
          </p>
        </div>

        {locked ? (
          <div className="pj-ac-lockbar">
            <div className="pj-ac-lockbar-i">🔒</div>
            <div className="pj-ac-lockbar-tx">
              <b>Packages are locked</b>
              <span>Tap any package and we take you up to choose a method.</span>
            </div>
            <button type="button" onClick={scrollToMethods}>Choose method</button>
          </div>
        ) : (
          <div className="pj-ac-rail">
            <div className="pj-ac-rail-top">
              <span className="pj-ac-rchip">
                <RailBrand boxed railKey={selectedRail.railKey} paymentKey={selectedRail.key} />
                {selectedRail.label}
              </span>
              <button type="button" className="pj-ac-change" onClick={scrollToMethods}>Change</button>
            </div>
            {missedPack ? (
              <p className="pj-ac-rail-note">
                <span className="pj-ac-miss">
                  {formatScAmount(missedPack.final_sc)} SC isn&apos;t available on {selectedRail.label}.
                </span>
                {note ? ` ${note}` : ''}
              </p>
            ) : note ? (
              <p className="pj-ac-rail-note">{note}</p>
            ) : null}
          </div>
        )}

        {packagesLoading && !displayGroups.length ? (
          <p className="pj-ac-empty">Loading packs…</p>
        ) : !displayGroups.length ? (
          <p className="pj-ac-empty">
            {selectedRail ? `No packs available for ${selectedRail.label} right now.` : 'No packs available right now.'}
          </p>
        ) : (
          <div className="onboarding-package-selection">
            {flashPack ? (
              <div className="pj-ac-gwrap">
                <div className="pj-ac-grph">
                  <span className="pj-ac-ttl">⚡ Flash deal</span>
                  <span className="pj-ac-cnt">
                    {flashGroup?.title || 'Today only'}
                    {flashRestPacks.length ? ` · ${flashRestPacks.length + 1} packs` : ''}
                  </span>
                  <PackCountdown
                    variant="flash"
                    endsAt={flashPack.countdown_ends_at || flashPack.ends_at || flashGroup?.countdown_ends_at}
                  />
                </div>
                <FlashCard
                  pkg={flashPack}
                  index={0}
                  selected={!customAmountMode && selectedPackage?.id === flashPack.id}
                  locked={locked}
                  onSelect={handlePackSelect}
                />
                {flashRestPacks.length ? (
                  <div className="pj-ac-flash-rest">
                    {flashRestPacks.map((pkg, index) => (
                      <FlashCard
                        key={pkg.id}
                        pkg={pkg}
                        index={index + 1}
                        selected={!customAmountMode && selectedPackage?.id === pkg.id}
                        locked={locked}
                        onSelect={handlePackSelect}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {welcomePacks.length ? (
              <div className="pj-ac-gwrap">
                <div className="pj-ac-grph">
                  <span className="pj-ac-ttl">🎁 Welcome Packages</span>
                  <span className="pj-ac-cnt">
                    {welcomeGroup?.title || 'New player deals'}
                    {welcomePacks.length ? ` · ${welcomePacks.length}` : ''}
                  </span>
                </div>
                <div className="pj-ac-g3">
                  {welcomePacks.map((pkg, index) => (
                    <PackCard
                      key={pkg.id}
                      pkg={pkg}
                      index={index + 1}
                      selected={!customAmountMode && selectedPackage?.id === pkg.id}
                      locked={locked}
                      rib={(() => {
                        const pct = packSavePercent(pkg);
                        return pct > 0 ? { cls: 'save', text: `SAVE ${pct}%` } : null;
                      })()}
                      onSelect={handlePackSelect}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {featuredPacks.length ? (
              <div className="pj-ac-gwrap">
                <div className="pj-ac-grph">
                  <span className="pj-ac-ttl">⭐ {featuredGroup?.title || 'Featured packages'}</span>
                  <span className="pj-ac-cnt">{featuredPacks.length} packs</span>
                </div>
                <div className="pj-ac-g3">
                  {featuredPacks.map((pkg, index) => (
                    <PackCard
                      key={pkg.id}
                      pkg={pkg}
                      index={index + 1}
                      selected={!customAmountMode && selectedPackage?.id === pkg.id}
                      locked={locked}
                      rib={(() => {
                        const pct = packSavePercent(pkg);
                        return pct > 0 ? { cls: 'save', text: `SAVE ${pct}%` } : null;
                      })()}
                      onSelect={handlePackSelect}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {limitedPacks.length && limitedGroup ? (
              <div className="pj-ac-gwrap">
                <div className="pj-ac-grph">
                  <span className="pj-ac-ttl">⏰ {limitedGroup.title}</span>
                  <span className="pj-ac-cnt">{limitedPacks.length} deals</span>
                </div>
                <div className="pj-ac-g3">
                  {limitedPacks.map((pkg, index) => (
                    <PackCard
                      key={pkg.id}
                      pkg={pkg}
                      index={index + 1}
                      selected={!customAmountMode && selectedPackage?.id === pkg.id}
                      locked={locked}
                      rib={(() => {
                        const pct = packSavePercent(pkg);
                        return pct > 0 ? { cls: 'save', text: `SAVE ${pct}%` } : null;
                      })()}
                      onSelect={handlePackSelect}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {generalPacks.length ? (
              <div className="pj-ac-gwrap">
                <div className="pj-ac-grph">
                  <span className="pj-ac-ttl">📦 All packages</span>
                  <span className="pj-ac-cnt">{generalPacks.length} packages</span>
                </div>
                <div className="pj-ac-g4">
                  {generalPacks.map((pkg, index) => (
                    <PackCard
                      key={pkg.id}
                      pkg={pkg}
                      index={index + 4}
                      selected={!customAmountMode && selectedPackage?.id === pkg.id}
                      locked={locked}
                      rib={
                        Number(pkg.id) === Number(bestId)
                          ? { cls: 'best', text: 'BEST VALUE' }
                          : packBadgeClass(pkg) === 'pop'
                            ? { cls: 'pop', text: 'MOST PICKED' }
                            : null
                      }
                      onSelect={handlePackSelect}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {chosenEco ? (
          <div className="pj-ac-chosen">
            <div className="pj-ac-chosen-art">
              <img {...getDepositPackageImageProps(0)} alt="" />
            </div>
            <div>
              <div className="pj-ac-chosen-lbl">YOUR PICK</div>
              <div className="pj-ac-chosen-big">
                {formatScAmount(chosenEco.sc)} coins for {money(chosenEco.price)}
              </div>
              <div className="pj-ac-chosen-sub">
                {chosenEco.freeAmt > 0 ? (
                  <>
                    Includes <b>{money(chosenEco.freeAmt)} of free coins</b>
                    {chosenEco.savePct > 0 ? ` · you save ${chosenEco.savePct}%` : ''}
                  </>
                ) : (
                  'Ready to pay when you are.'
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {applicableVouchers.length > 0 && selectedPackage && !customAmountMode ? (
        <section className="pj-ac-sec">
          <h3 className="pj-ac-h3">Daily bonus voucher</h3>
          <p className="pj-ac-lede">Valid for 24 hours · One-time use</p>
          <select
            className="pj-ac-select"
            value={selectedVoucherId || ''}
            onChange={(e) => onSelectVoucher?.(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No voucher</option>
            {applicableVouchers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.percent_off}% off
              </option>
            ))}
          </select>
        </section>
      ) : null}

      <section className="pj-ac-sec onboarding-amount-selection">
        <div className="pj-ac-sec-top">
          <span className={`pj-ac-badge${step3Done ? ' ok' : locked ? ' off' : ''}`}>
            {step3Done ? 'OR ✓' : 'OR'}
          </span>
          <h2>{isChimeManualRail(selectedRail) ? 'Pick your own amount' : 'Pick your own amount'}</h2>
          <p className="pj-ac-lede">
            {locked ? 'Unlocks with your payment method.' : customCopy.hint}
          </p>
        </div>
        {locked ? (
          <div className="pj-ac-lockpane">
            <b>Choose a payment method first</b>
            <span>Each method has its own smallest and largest amount.</span>
          </div>
        ) : (
          <>
            {customAmounts.length > 0 ? (
              <div className="pj-ac-chips">
                {customAmounts.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`pj-ac-chip${customAmountMode && selectedAmount === v ? ' on' : ''}`}
                    aria-pressed={customAmountMode && selectedAmount === v}
                    onClick={() => onSelectCustomAmount?.(v)}
                  >
                    {money(v)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="pj-ac-lede">{selectedRail ? 'No preset amounts for this method.' : 'No preset amounts right now.'}</p>
            )}
            {allowCustomField || isChimeManualRail(selectedRail) || isCryptoDirectRail(selectedRail) ? (
              <div className="pj-ac-irow">
                <div className="pj-ac-ibox">
                  <span className="pj-ac-cur">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={selectedAmount != null ? '' : customAmount}
                    onChange={(e) => {
                      const next = constrainAmountInput(e.target.value);
                      if (next == null) return;
                      onCustomAmountChange?.(next);
                    }}
                    aria-invalid={Boolean(customAmountError)}
                  />
                </div>
              </div>
            ) : null}
            {customAmountError ? <p className="pj-ac-msg w">{customAmountError}</p> : null}
          </>
        )}
      </section>

      {extraFields}

      <section className="pj-ac-sec">
        <div className="pj-ac-livehead">
          <span className="pj-ac-pulse" />
          <h2>Bought in the last hour</h2>
          <span className="pj-ac-liven">{liveToday} today</span>
        </div>
        <p className="pj-ac-lede">Real players adding coins right now.</p>
        <div className="pj-ac-feed">
          {dummyRecent.map((row) => (
            <div className="pj-ac-fr" key={`${row.initials}-${row.ago}-${row.pack}`}>
              <div className="pj-ac-av">{row.initials}</div>
              <div className="pj-ac-fr-tx">
                <div className="pj-ac-l1">
                  <b>{row.name}</b> bought <span className="g">{row.pack}</span>
                </div>
                <div className="pj-ac-l2">Live on this site</div>
              </div>
              <div className="pj-ac-ago">{row.ago}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pj-ac-sec">
        <div className="pj-ac-sec-top">
          <div className="pj-ac-sec-head">
            <h2>Your purchase history</h2>
            <button
              type="button"
              className="pj-ac-refresh"
              onClick={() => onRefreshPurchases?.()}
              disabled={syncing || closingSyncing}
            >
              {syncing || closingSyncing ? 'Checking…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        {histRows.length === 0 ? (
          <p className="pj-ac-empty">Nothing here yet.</p>
        ) : (
          <>
            {visibleHistRows.map((h) => {
            const [cls] = historyStatus(h.status);
            const sub =
              cls === 'ok'
                ? 'Coins added to your balance'
                : cls === 'pend'
                  ? 'Pending'
                  : 'Payment window closed — nothing charged';
            const scVal = Number(h.creditSc ?? h.credit_sc ?? h.amount);
            return (
              <div className="pj-ac-hr" key={h.id}>
                <span className="pj-ac-hr-i">
                  <HistoryBrand row={h} rails={rails} />
                </span>
                <div className="pj-ac-hr-tx">
                  <div className="pj-ac-hr-t">{money(h.amount)} · {depositMethodLabelSafe(h)}</div>
                  <div className="pj-ac-hr-d">{formatHistoryStamp(h.date)}</div>
                  <div className={`pj-ac-hs ${cls}`}>{sub}</div>
                </div>
                <div className="pj-ac-hend">
                  <div className="pj-ac-hc">{cls === 'dead' ? '—' : `+${formatScAmount(scVal)} SC`}</div>
                </div>
              </div>
            );
            })}
            {histRows.length > 4 ? (
              <button
                type="button"
                className="pj-ac-more"
                onClick={() => setShowAllHist((v) => !v)}
              >
                {showAllHist ? 'Show less' : `Show all ${histRows.length} purchases`}
              </button>
            ) : null}
          </>
        )}
        <p className="pj-ac-help">
          Coins missing?{' '}
          <a href={`mailto:${site.supportEmail}`}>Message support</a>
          {' — we answer in about 2 minutes.'}
        </p>
      </section>

      <div className="lw-ac-bar lw-ac-bar--inline" ref={inlineBarRef}>
        <div className="lw-ac-barin">
          <p className="pj-ac-dl">{dockLine}</p>
          <PayCtaButton
            className={`pj-ac-paybtn${ctaReady ? ' go' : ''}${inlineCtaVisible ? ' onboarding-deposit-btn-final' : ''}`}
            disabled={ctaDisabled}
            onClick={handlePay}
            big={ctaBig}
          />
        </div>
      </div>
      {portalEl
        ? createPortal(
            <div
              ref={overlayBarRef}
              className={`lw-ac-bar lw-ac-bar--fixed${inlineCtaVisible ? ' is-hidden' : ''}`}
              aria-hidden={inlineCtaVisible}
            >
              <div className="lw-ac-barin">
                <p className="pj-ac-dl">{dockLine}</p>
                <PayCtaButton
                  className={`pj-ac-paybtn${ctaReady ? ' go' : ''}${!inlineCtaVisible ? ' onboarding-deposit-btn-final' : ''}`}
                  disabled={ctaDisabled}
                  onClick={handlePay}
                  big={ctaBig}
                  tabIndex={inlineCtaVisible ? -1 : 0}
                />
              </div>
            </div>,
            portalEl
          )
        : null}
    </>
  );
}

function flattenGroups(groups = []) {
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    for (const pkg of g.packages || []) out.push(pkg);
  }
  return out;
}

function depositMethodLabelSafe(row) {
  const coinCode = row?.cryptoCurrency || row?.crypto_currency;
  if (coinCode) {
    const meta = cryptoCoinMeta(coinCode);
    return meta?.name || String(coinCode).toUpperCase();
  }
  return row.methodDisplayLabel || row.method || 'Purchase';
}

function HistoryBrand({ row, rails }) {
  const coinCode = row?.cryptoCurrency || row?.crypto_currency;
  if (coinCode) {
    return (
      <span className="pj-ac-hr-coin">
        <CoinMark code={coinCode} />
      </span>
    );
  }
  const methodKey = String(row.method || '').toLowerCase();
  const railMatch =
    rails.find((r) => r.key === methodKey) ||
    rails.find((r) => methodKey.includes('chime') && r.key === 'chime');
  return (
    <RailBrand
      boxed
      railKey={railMatch?.railKey || methodKey}
      paymentKey={methodKey || 'card'}
    />
  );
}
