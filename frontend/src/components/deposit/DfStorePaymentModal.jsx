import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CashAppIcon, PayPalIcon } from '../../assets/icons';
import { ChimeLogo } from '../payment/ChimeLogo';
import { formatMoney, formatScLabel, packBonusParts } from '../../utils/storeChest';
import { packagePayableOnRail } from '../../utils/depositRails';
import './df-store-payment-modal.css';

function ChimeMark() {
  return <ChimeLogo className="store-payment-chime-mark" color="#fff" />;
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

/** Orionstars payment webps (copied into public/df-online/payment-logos). */
const RAIL_WEBP = {
  apple_pay: { src: '/df-online/payment-logos/apple-pay.webp', brand: 'apple_pay', bg: '#050505' },
  google_pay: { src: '/df-online/payment-logos/google-pay.webp', brand: 'google_pay', bg: '#fff' },
  card: { src: '/df-online/payment-logos/card.webp', brand: 'card', bg: '#fff' },
  credit_card: { src: '/df-online/payment-logos/card.webp', brand: 'card', bg: '#fff' },
  debit_card: { src: '/df-online/payment-logos/card.webp', brand: 'card', bg: '#fff' },
  crypto: { src: '/df-online/payment-logos/bitcoin.webp', brand: 'crypto', bg: '#1b1030' },
  scrypto: { src: '/df-online/payment-logos/bitcoin.webp', brand: 'crypto', bg: '#1b1030' },
  selfcrypto: { src: '/df-online/payment-logos/bitcoin.webp', brand: 'crypto', bg: '#1b1030' },
  bank_transfer: { src: '/df-online/payment-logos/bank.webp', brand: 'bank', bg: '#fff' }
};

const RAIL_ICONS = {
  cashapp: CashAppIcon,
  chime: ChimeMark,
  paypal: PayPalIcon,
  zelle: ZelleMark
};

const RAIL_TILE = {
  cashapp: { bg: '#fff', brand: 'cash_app' },
  chime: { bg: '#1ec677', brand: 'chime' },
  paypal: { bg: '#003087', brand: 'paypal' },
  zelle: { bg: '#6d1ed4', brand: 'zelle' }
};

function resolveKey(rail) {
  const railKey = String(rail?.railKey || '').toLowerCase();
  const pay = String(rail?.key || '').toLowerCase().replace(/-/g, '_');
  if (railKey.startsWith('chime') || pay.startsWith('chime')) return 'chime';
  if (pay === 'credit_card' || pay === 'debit_card') return 'card';
  if (pay === 'cash_app' || pay === 'cashapp') return 'cashapp';
  return pay || railKey;
}

function BrandMark({ rail }) {
  const key = resolveKey(rail);
  const webp = RAIL_WEBP[key];
  if (webp) {
    return (
      <span
        className={`payment-brand-logo payment-brand-logo--${webp.brand}`}
        style={{ background: webp.bg }}
        aria-hidden
      >
        <img src={webp.src} alt="" width={56} height={34} decoding="async" />
      </span>
    );
  }
  const Icon = RAIL_ICONS[key];
  const tile = RAIL_TILE[key] || { bg: '#111', brand: key || 'default' };
  if (Icon) {
    return (
      <span
        className={`payment-brand-logo payment-brand-logo--${tile.brand}`}
        style={{ background: tile.bg }}
        aria-hidden
      >
        <Icon />
      </span>
    );
  }
  const label = (rail?.label || '?').slice(0, 6).toUpperCase();
  return (
    <span className="store-payment-card-mark" aria-hidden>
      {label}
    </span>
  );
}

const RULES_COPY =
  'No 100% bonus wagering target. Platform returns follow the load tiers: 10–14.99 SC needs 50 SC; 15–39.99 SC uses stepped minimums; 40–49.99 SC needs 3×; 50+ SC needs 4×. The return cap is 10× the load. Check the exact limits before loading.';

const PREFERRED_ORDER = [
  'cashapp',
  'apple_pay',
  'google_pay',
  'chime',
  'card',
  'paypal',
  'zelle',
  'venmo',
  'crypto'
];

function sortRails(rails) {
  return [...(rails || [])].sort((a, b) => {
    const ai = PREFERRED_ORDER.indexOf(resolveKey(a));
    const bi = PREFERRED_ORDER.indexOf(resolveKey(b));
    const av = ai === -1 ? 99 : ai;
    const bv = bi === -1 ? 99 : bi;
    return av - bv;
  });
}

function bonusLabel(pkg) {
  const raw = String(pkg?.discount_label || pkg?.badge || '').trim();
  if (raw) {
    if (/bonus/i.test(raw)) return raw;
    if (/%\s*sc/i.test(raw)) return `${raw} BONUS`;
    return raw;
  }
  const { pct } = packBonusParts(pkg);
  if (pct > 0) return `+${pct}% SC BONUS`;
  return null;
}

/**
 * Payment method popup — admin-enabled rails filtered by package amount / provider rules.
 */
export function DfStorePaymentModal({
  open,
  package: pkg,
  rails = [],
  amountBounds = { min: 0, max: Infinity },
  selectedRail = null,
  submitting = false,
  onClose,
  onSelectRail,
  onContinue
}) {
  const [localRailKey, setLocalRailKey] = useState(null);

  const payableRails = useMemo(() => {
    if (!pkg) return [];
    const bounds = {
      min: Number(amountBounds?.min) || 0,
      max: Number.isFinite(Number(amountBounds?.max)) ? Number(amountBounds.max) : Infinity
    };
    const eligible = (rails || []).filter((rail) => packagePayableOnRail(pkg, rail, bounds));
    return sortRails(eligible);
  }, [rails, pkg, amountBounds?.min, amountBounds?.max]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('dragonfury-store-payment-open');
    document.documentElement.classList.add('dragonfury-store-payment-open');
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('dragonfury-store-payment-open');
      document.documentElement.classList.remove('dragonfury-store-payment-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setLocalRailKey(null);
      return;
    }
    setLocalRailKey((prev) => {
      if (prev && payableRails.some((r) => r.railKey === prev)) return prev;
      if (selectedRail?.railKey && payableRails.some((r) => r.railKey === selectedRail.railKey)) {
        return selectedRail.railKey;
      }
      return payableRails[0]?.railKey || null;
    });
  }, [open, payableRails, selectedRail?.railKey]);

  const activeRail = useMemo(
    () => payableRails.find((r) => r.railKey === localRailKey) || null,
    [payableRails, localRailKey]
  );

  if (!open || !pkg) return null;

  const price = formatMoney(pkg.final_price);
  const listPrice = Number(pkg.actual_price ?? pkg.actualPrice);
  const offerPrice = Number(pkg.final_price);
  const showList =
    Number.isFinite(listPrice) && Number.isFinite(offerPrice) && listPrice > offerPrice + 0.009;
  const scNum = formatScLabel(pkg.final_sc).replace(/\s*SC$/i, '');
  const bonus = bonusLabel(pkg);

  function handleContinue() {
    if (!activeRail || submitting) return;
    onSelectRail?.(activeRail);
    onContinue?.(activeRail, pkg);
  }

  const node = (
    <div className="store-payment-modal" role="dialog" aria-label="Choose payment method" aria-modal="true">
      <button
        className="store-payment-modal__backdrop"
        type="button"
        tabIndex={-1}
        aria-label="Close payment method popup"
        onClick={onClose}
      />
      <section
        className="store-payment-modal__panel compact-payment-panel sc-compact df-premium-modal"
        tabIndex={-1}
      >
        <button
          type="button"
          className="dragonfury-close-button store-payment-modal__close df-premium-close"
          aria-label="Close payment method popup"
          onClick={onClose}
        />

        <div className="store-payment-modal__hero">
          <h2 className="df-premium-eyebrow">PAYMENT METHOD</h2>
          <strong className="store-payment-modal__amount">
            {scNum} <small>SC</small>
          </strong>
          <span
            className="dragonfury-offer-prices store-payment-modal__prices"
            aria-label={showList ? `Was ${formatMoney(listPrice)}. Price ${price}.` : `Price ${price}.`}
          >
            <span className="dragonfury-offer-price dragonfury-offer-price--offer">
              <small>Price</small>
              {showList ? <del>{formatMoney(listPrice)}</del> : null}
              <strong data-dragonfury-offer-price="true">{price}</strong>
            </span>
          </span>
          {bonus ? <small className="store-payment-modal__bonus">{bonus}</small> : null}
        </div>

        <aside className="sc-standard-rules sc-compact" aria-label="Standard package rules">
          <span className="sc-badge sc-badge--neutral">
            <svg className="sc-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            Standard play
          </span>
          <details className="sc-disclosure">
            <summary>
              <svg className="sc-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7h.01" />
              </svg>
              <span>Game return &amp; withdrawal rules</span>
              <svg className="sc-icon sc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="sc-disclosure__body">
              <p>{RULES_COPY}</p>
            </div>
          </details>
        </aside>

        <div className="store-payment-options" role="group" aria-label="Payment methods">
          {payableRails.length === 0 ? (
            <p className="store-payment-options__empty">
              No payment methods available for this package amount. Try another chest or contact support.
            </p>
          ) : (
            payableRails.map((rail) => {
              const active = rail.railKey === localRailKey;
              return (
                <button
                  key={rail.railKey}
                  type="button"
                  className={`store-payment-option${active ? ' store-payment-option--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    setLocalRailKey(rail.railKey);
                    onSelectRail?.(rail);
                  }}
                >
                  <BrandMark rail={rail} />
                  <strong>{rail.label}</strong>
                  {active ? <span className="store-payment-option__check" aria-hidden>✓</span> : null}
                </button>
              );
            })
          )}
        </div>

        <small className="store-payment-modal__checkout-note">Secure checkout</small>

        <div className="compact-payment-footer">
          <button
            className="store-payment-continue df-premium-cta"
            type="button"
            disabled={!activeRail || submitting}
            onClick={handleContinue}
          >
            {submitting ? 'Processing…' : 'CONTINUE'}
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(node, document.body);
}
