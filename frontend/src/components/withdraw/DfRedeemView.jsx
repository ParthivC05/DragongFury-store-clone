import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CashAppIcon, PayPalIcon, ZelleIcon, SCCoinIcon } from '../../assets/icons';
import { ChimeLogo } from '../payment/ChimeLogo';
import { formatSc, constrainAmountInput } from '../../utils/currency';
import './df-redeem.css';

/** Payout keys the /payments/chime-cashapp/withdraw endpoint accepts. */
const SUPPORTED_PAYOUT_KEYS = new Set([
  'cashapp',
  'chime',
  'paypal',
  'venmo',
  'zelle',
  'card',
  'bank_transfer'
]);

/**
 * Live DragonFury redeem only collects a destination for wallet-style payouts.
 * Card / ACH are shown when admin-enabled, but never ask for card/account numbers here.
 */
const RECIPIENT_METHODS = new Set(['cashapp', 'chime', 'paypal', 'venmo', 'zelle']);

export function methodNeedsRecipient(methodKey) {
  return RECIPIENT_METHODS.has(String(methodKey || '').toLowerCase());
}

function ChimeMark() {
  return <ChimeLogo className="redeem-method__chime" color="#1ec677" />;
}

const METHOD_LOGO = {
  cashapp: { src: '/df-online/payment-logos/cash-app-official.svg', bg: '#fff', wide: true },
  chime: { src: '/df-online/payment-logos/chime-official.webp', bg: '#fff', wide: true }
};

const METHOD_ICONS = {
  cashapp: CashAppIcon,
  chime: ChimeMark,
  paypal: PayPalIcon,
  venmo: PayPalIcon,
  zelle: ZelleIcon
};

const METHOD_TILE = {
  cashapp: '#fff',
  chime: '#fff',
  paypal: '#003087',
  venmo: '#008cff',
  zelle: '#6d1ed4',
  card: '#1b1030',
  bank_transfer: '#1b1030'
};

const METHOD_FALLBACK_LABEL = {
  cashapp: 'Cash App',
  chime: 'Chime',
  paypal: 'PayPal',
  venmo: 'Venmo',
  zelle: 'Zelle',
  card: 'Debit Card',
  bank_transfer: 'Bank (ACH)'
};

const RECIPIENT_COPY = {
  cashapp: {
    label: 'Cash App $cashtag',
    placeholder: '$username',
    prefix: null,
    hint: 'Your Cash App cashtag, without spaces.'
  },
  chime: {
    label: 'Chime $ChimeSign',
    placeholder: '$ChimeSign',
    prefix: '$',
    hint: '4–50 characters after the $.'
  },
  paypal: {
    label: 'PayPal email',
    placeholder: 'you@example.com',
    prefix: null,
    hint: 'The email on your PayPal account.'
  },
  venmo: {
    label: 'Venmo email',
    placeholder: 'you@example.com',
    prefix: null,
    hint: 'The email on your Venmo account.'
  },
  zelle: {
    label: 'Zelle email or phone',
    placeholder: 'email or +1phone',
    prefix: null,
    hint: 'Whatever your bank has enrolled with Zelle.'
  }
};

function MethodMark({ methodKey }) {
  const logo = METHOD_LOGO[methodKey];
  if (logo) {
    return (
      <span
        className={`redeem-method__mark${logo.wide ? ' redeem-method__mark--wide' : ''}`}
        style={{ background: logo.bg }}
        aria-hidden
      >
        <img src={logo.src} alt="" decoding="async" loading="lazy" />
      </span>
    );
  }
  const Icon = METHOD_ICONS[methodKey];
  if (Icon) {
    return (
      <span
        className="redeem-method__mark"
        style={{ background: METHOD_TILE[methodKey] || '#1b1030' }}
        aria-hidden
      >
        <Icon />
      </span>
    );
  }
  return (
    <span className="redeem-method__mark redeem-method__mark--text" aria-hidden>
      {String(methodKey || '?').slice(0, 4).toUpperCase()}
    </span>
  );
}

/**
 * Build the payout tiles from the withdraw-methods API response. No static fallback —
 * every admin-enabled supported method is shown. Card/bank never collect destination fields.
 */
export function buildRedeemMethods(paymentTypes, { withdrawMin, withdrawMax, xxpayMin }) {
  const rows = [];
  for (const pt of Array.isArray(paymentTypes) ? paymentTypes : []) {
    const key = String(pt?.key || '').toLowerCase();
    if (!SUPPORTED_PAYOUT_KEYS.has(key)) continue;
    const providers = Array.isArray(pt.providers) ? pt.providers : [];
    if (key === 'chime') {
      const automatic = providers.find((p) => String(p.providerCode || '').toLowerCase() !== 'manual');
      rows.push({
        id: 'chime-manual',
        key: 'chime',
        label: 'Chime Manual',
        providerCode: 'manual',
        min: withdrawMin,
        max: withdrawMax,
        needsRecipient: true
      });
      if (automatic) {
        const providerCode = String(automatic.providerCode || '').toLowerCase();
        rows.push({
          id: `chime-${providerCode}`,
          key: 'chime',
          label: 'Chime',
          providerCode,
          min: providerCode === 'xxpay' ? Math.max(withdrawMin, xxpayMin) : withdrawMin,
          max: withdrawMax,
          needsRecipient: true
        });
      }
      continue;
    }
    const providerCode = String(providers[0]?.providerCode || '').toLowerCase();
    rows.push({
      id: key,
      key,
      label: (pt.label || '').trim() || METHOD_FALLBACK_LABEL[key] || key,
      providerCode: providerCode || null,
      min: providerCode === 'xxpay' ? Math.max(withdrawMin, xxpayMin) : withdrawMin,
      max: withdrawMax,
      needsRecipient: methodNeedsRecipient(key)
    });
  }
  return rows;
}

/**
 * Quick-pick chips. Prefers the live 50/100/250/500 ladder when it fits inside the
 * player's limits, otherwise it walks min → max on a sensible step.
 */
export function buildRedeemPresets(min, max) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];

  const ladder = [50, 100, 250, 500].filter((v) => v >= lo && v <= hi);
  if (ladder.length >= 2) return ladder;

  const span = hi - lo;
  if (span <= 0) return [Math.round(lo * 100) / 100];

  const rawStep = span / 3;
  const step = rawStep >= 50 ? 50 : rawStep >= 20 ? 25 : rawStep >= 10 ? 10 : rawStep >= 5 ? 5 : 1;
  const out = [Math.round(lo * 100) / 100];
  let next = Math.ceil(lo / step) * step;
  if (next <= lo) next += step;
  while (next < hi && out.length < 4) {
    out.push(Math.round(next * 100) / 100);
    next += step;
  }
  if (out.length < 4 && hi > out[out.length - 1]) out.push(Math.round(hi * 100) / 100);
  return [...new Set(out)];
}

function emailLike(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Mirrors the destination rules the withdraw endpoint enforces. */
export function recipientError(methodKey, raw, extra = {}) {
  if (!methodNeedsRecipient(methodKey)) return null;
  const body = String(raw || '').trim().replace(/^\$+/, '');
  if (!body) return 'Enter where the money should go.';
  switch (methodKey) {
    case 'chime':
      if (body.length < 4 || body.length > 50) return 'Chime name must be 4–50 characters after $.';
      return null;
    case 'paypal':
    case 'venmo':
      if (!emailLike(body)) return 'Enter a valid email address.';
      return null;
    case 'zelle':
      if (!emailLike(body) && !/^\+?\d{10,15}$/.test(body.replace(/[\s()-]/g, ''))) {
        return 'Enter a valid email or phone number.';
      }
      return null;
    default:
      return body.length >= 2 ? null : 'Enter a valid account.';
  }
}

export function nextAllowanceResetLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function TierRing({ current, target, isMax }) {
  const circumference = 263.89;
  const score =
    target > 0
      ? Math.min(circumference, Math.max(0, (Number(current) / Number(target)) * circumference))
      : isMax
        ? circumference
        : 0;
  const cur = Math.round(Number(current) || 0);
  const tgt = Math.round(Number(target) || 0);
  return (
    <div
      className="withdrawal-allowance__ring"
      style={{ '--redeem-ring-score': score }}
      role="img"
      aria-label={`Tier score: ${cur} of ${tgt}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" />
        <circle className="withdrawal-allowance__ring-fill" cx="50" cy="50" r="42" />
      </svg>
      <span>
        <strong>{cur}</strong>
        <small>/ {tgt}</small>
      </span>
    </div>
  );
}

function RulesModal({ open, onClose, withdrawMin, withdrawMax, dailyMax, currency, methods }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.body.classList.add('df-redeem-modal-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('df-redeem-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const methodNames = (methods || []).map((m) => m.label).filter(Boolean);
  const methodLine =
    methodNames.length > 0
      ? `${methodNames.join(', ')} only.`
      : 'Payout methods depend on what your store has enabled.';

  return createPortal(
    <div className="redeem-rules-modal" role="presentation">
      <button type="button" className="redeem-rules-modal__backdrop" aria-label="Close Redemption rules" onClick={onClose} />
      <section
        className="redeem-rules-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="redeem-rules-title"
      >
        <button
          type="button"
          className="dragonfury-close-button redeem-rules-modal__close"
          aria-label="Close Redemption rules"
          onClick={onClose}
        />
        <div className="redeem-rules-modal__body">
          <span className="redeem-rules-modal__eyebrow">Redeem Center</span>
          <h2 id="redeem-rules-title">Redemption Rules</h2>

          <details className="redeem-rules-modal__help">
            <summary>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7h.01" strokeLinecap="round" />
              </svg>
              <span>How balances work</span>
              <svg
                className="redeem-rules-modal__chevron"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p>
              Redeemable SC is the portion eligible for a withdrawal request, subject to your daily allowance and account
              checks. It is part of your total, not an extra balance.
            </p>
          </details>

          <h3>Before you request</h3>
          <ol>
            <li>
              {currency} {formatSc(withdrawMin)} – {formatSc(withdrawMax)} per request
              {dailyMax != null ? `, subject to your daily allowance of ${currency} ${formatSc(dailyMax)}.` : '.'}
            </li>
            <li>
              Your wallet and withdrawal tier set the limit. Requests must fit both your redeemable SC and your remaining
              daily allowance. Pending requests reserve allowance; cancelled or declined requests release it.
            </li>
            <li>{methodLine} The destination must belong to you.</li>
            <li>If you already have a request waiting for review, a new one is refused until that one has been actioned.</li>
          </ol>

          <h3>Review and payout</h3>
          <ol>
            <li>Submitting creates a request. The payout amount is debited after approval.</li>
            <li>The operator reviews every request and sends the payout to the destination you gave.</li>
            <li>Requests may require identity, payment, and account verification.</li>
            <li>
              Requests may be delayed, restricted, or rejected where activity appears unauthorized, inconsistent,
              duplicated, or otherwise suspicious.
            </li>
          </ol>
        </div>
      </section>
    </div>,
    document.body
  );
}

/**
 * Dragon Fury /redeem UI — single-page cash out (live parity, mobile first).
 * Purely presentational: the Withdraw page owns all data loading and submission.
 */
export function DfRedeemView({
  currency = 'SC',
  loading = false,
  methods = [],
  selectedMethod = null,
  onSelectMethod,
  amount = '',
  onAmountChange,
  presets = [],
  recipient = '',
  onRecipientChange,
  cardValid = '',
  onCardValidChange,
  routingNumber = '',
  onRoutingNumberChange,
  withdrawMin = 0,
  withdrawMax = 0,
  availableNow = 0,
  totalPlaySc = 0,
  redeemableSc = 0,
  frozenRsc = 0,
  lockedBsc = 0,
  dailyMax = null,
  dailyRemaining = null,
  pendingToday = 0,
  tierNumber = 1,
  tierName = '',
  tierXp = 0,
  tierXpTarget = 0,
  tierIsMax = false,
  profileComplete = true,
  kycBlocking = false,
  neverDeposited = false,
  playthroughPending = 0,
  submitting = false,
  onSubmit,
  historySlot = null,
  adminSlot = null,
  noticeSlot = null
}) {
  const [rulesOpen, setRulesOpen] = useState(false);

  const method = useMemo(
    () => methods.find((m) => (m.id || m.key) === selectedMethod) || null,
    [methods, selectedMethod]
  );
  const methodKey = method?.key || '';
  const needsRecipient = methodNeedsRecipient(methodKey);
  const copy = needsRecipient
    ? RECIPIENT_COPY[methodKey] || {
        label: 'Recipient',
        placeholder: 'Account',
        prefix: null,
        hint: 'Where the payout should land.'
      }
    : null;

  const amountNum = parseFloat(amount) || 0;
  const methodMin = method?.min ?? withdrawMin;
  const maxAllowed = Math.min(withdrawMax, availableNow);
  const destError = needsRecipient
    ? recipientError(methodKey, recipient, { cardValid, routingNumber })
    : null;

  const gateMessage = !profileComplete
    ? 'Complete your profile to cash out.'
    : kycBlocking
      ? 'Verify your identity to cash out.'
      : null;

  const amountError = (() => {
    if (amountNum <= 0) return null;
    if (amountNum < methodMin) return `Minimum for this method is ${currency} ${formatSc(methodMin)}.`;
    if (amountNum > withdrawMax) return `Maximum per request is ${currency} ${formatSc(withdrawMax)}.`;
    if (amountNum > availableNow) return `You can redeem ${currency} ${formatSc(availableNow)} right now.`;
    if (dailyRemaining != null && amountNum > dailyRemaining + 0.004) {
      return dailyRemaining <= 0
        ? 'Your daily allowance is used up. Try again tomorrow.'
        : `Only ${currency} ${formatSc(dailyRemaining)} left in today's allowance.`;
    }
    return null;
  })();

  const amountReady = amountNum > 0 && !amountError;
  const ready = Boolean(
    !gateMessage && method && amountReady && (!needsRecipient || !destError) && !submitting
  );

  const ctaLabel = submitting
    ? 'SUBMITTING…'
    : gateMessage
      ? gateMessage.toUpperCase()
      : !method
        ? 'SELECT A PAYOUT METHOD'
        : !amountReady
          ? 'CHECK AMOUNT AND ALLOWANCE'
          : needsRecipient && destError
            ? 'ENTER RECIPIENT DETAILS'
            : `REDEEM ${formatSc(amountNum)} SC`;

  const showDaily = dailyMax != null && dailyRemaining != null;
  const dailyUsedPct = showDaily && dailyMax > 0 ? Math.min(100, Math.max(0, ((dailyMax - dailyRemaining) / dailyMax) * 100)) : 0;
  const completedToday = showDaily ? Math.max(0, dailyMax - dailyRemaining - (Number(pendingToday) || 0)) : 0;
  const resetLabel = nextAllowanceResetLabel();
  const noRecipientHint =
    methodKey === 'card'
      ? 'Debit card payout — no card number needed here. The operator completes the send after review.'
      : methodKey === 'bank_transfer'
        ? 'Bank (ACH) payout — no account details needed here. The operator completes the send after review.'
        : null;

  return (
    <section
      className="lobby-page lobby-page--redeem compact-redeem-page redeem-route-page df-redeem-page"
      aria-label="Redeem"
    >
      <header className="df-redeem-heading">
        <p>REDEEM CENTER</p>
        <h1>CASH OUT</h1>
        <button type="button" className="df-redeem-rules-btn" onClick={() => setRulesOpen(true)}>
          Rules
        </button>
      </header>

      <section className="withdrawal-allowance" aria-label="Your withdrawal tier">
        <header className="withdrawal-allowance__header">
          <div className="withdrawal-allowance__tier-block">
            <TierRing current={tierXp} target={tierXpTarget} isMax={tierIsMax} />
            <div>
              <span className="withdrawal-allowance__eyebrow">Withdrawal tier</span>
              <h2 className="withdrawal-allowance__tier">
                Tier {tierNumber}
                {tierName ? <span> · {tierName}</span> : null}
              </h2>
            </div>
          </div>
          <div className="withdrawal-allowance__available" data-available={availableNow > 0 ? 'true' : 'false'}>
            <span>Available now</span>
            <strong>${formatSc(availableNow)}</strong>
          </div>
        </header>

        <div className="withdrawal-allowance__usage">
          <div>
            <span>Daily allowance</span>
            <strong>
              {showDaily ? (
                <>
                  ${formatSc(dailyRemaining)} left <small>/ ${formatSc(dailyMax)}</small>
                </>
              ) : (
                <>
                  ${formatSc(withdrawMax)} <small>/ request</small>
                </>
              )}
            </strong>
          </div>
          {showDaily ? (
            <progress max={100} value={dailyUsedPct} aria-label={`${Math.round(dailyUsedPct)}% of daily limit used`} />
          ) : null}
        </div>

        <div className="withdrawal-allowance__badges">
          <span className="redeem-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
            Resets {resetLabel}
          </span>
        </div>

        <details className="withdrawal-allowance__disclosure">
          <summary>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 3v17h17M8 15v-4M13 15V7M18 15v-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Allowance &amp; tier details</span>
            <svg
              className="withdrawal-allowance__chevron"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="withdrawal-allowance__disclosure-body">
            <dl className="withdrawal-allowance__metrics">
              {showDaily ? (
                <>
                  <div className="withdrawal-allowance__metric">
                    <dt>Daily limit</dt>
                    <dd>${formatSc(dailyMax)}</dd>
                  </div>
                  <div className="withdrawal-allowance__metric">
                    <dt>Completed today</dt>
                    <dd>${formatSc(completedToday)}</dd>
                  </div>
                  <div className="withdrawal-allowance__metric">
                    <dt>Pending requests</dt>
                    <dd>${formatSc(pendingToday)}</dd>
                  </div>
                  <div className="withdrawal-allowance__metric">
                    <dt>Remaining today</dt>
                    <dd>${formatSc(dailyRemaining)}</dd>
                  </div>
                </>
              ) : null}
              <div className="withdrawal-allowance__metric">
                <dt>Wallet balance</dt>
                <dd>${formatSc(availableNow)}</dd>
              </div>
            </dl>
            <p>
              Completed withdrawals and pending requests count toward your daily limit. Cancelled or declined requests
              release their allowance.
            </p>
            <p>
              Available withdrawal SC reflects pending requests, daily limits and SC restricted to play.
            </p>
            {!tierIsMax && tierXpTarget > 0 ? (
              <div className="withdrawal-allowance__next">
                <strong>Progress to Tier {tierNumber + 1}</strong>
                <progress
                  max={tierXpTarget}
                  value={Math.min(tierXp, tierXpTarget)}
                  aria-label={`Progress to Tier ${tierNumber + 1}`}
                />
                <small>
                  {Math.max(0, Math.round(tierXpTarget - tierXp))} more points · {Math.round(tierXp)} /{' '}
                  {Math.round(tierXpTarget)}
                </small>
              </div>
            ) : null}
          </div>
        </details>
      </section>

      <div className="redeem-balance-grid" aria-label="Redeem balances">
        <article className="redeem-balance-card">
          <span className="redeem-balance-card__label">TOTAL SC FOR PLAY</span>
          <strong className="redeem-balance-card__value">
            <SCCoinIcon className="redeem-balance-card__coin" />
            {formatSc(totalPlaySc)}
          </strong>
          <small>
            {lockedBsc > 0 ? `${formatSc(lockedBsc)} SC locked — verify phone to unlock` : 'Games only, not cashable'}
          </small>
        </article>
        <article className="redeem-balance-card redeem-balance-card--rsc">
          <span className="redeem-balance-card__label">REDEEMABLE SC</span>
          <strong className="redeem-balance-card__value">{formatSc(redeemableSc)}</strong>
          <small>
            {frozenRsc > 0
              ? `${formatSc(frozenRsc)} SC on hold for pending redeems`
              : playthroughPending > 0
                ? `Play ${formatSc(playthroughPending)} SC more to unlock the rest`
                : 'Redeemable SC is included in Total SC'}
          </small>
        </article>
      </div>

      <details className="redeem-disclosure">
        <summary>How balances work</summary>
        <p>
          Redeemable SC is the portion eligible for a withdrawal request, subject to your daily allowance and account
          checks. It is part of your total, not an extra balance. SC you buy in the shop is for play — winnings that
          land as Redeemable SC are what you can cash out here.
        </p>
      </details>

      <details className="redeem-disclosure">
        <summary>Operator approval required</summary>
        <p>
          Every request is reviewed by the operator before a payout is sent. The payout amount is debited after
          approval.
        </p>
      </details>

      {noticeSlot}

      <section className="redeem-form-panel" aria-label="Redeem amount">
        <div className="redeem-field">
          <label htmlFor="redeem-amount">Amount</label>
          <div className="redeem-amount-field">
            <span className="redeem-amount-field__unit" aria-hidden>
              SC
            </span>
            <input
              id="redeem-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              disabled={Boolean(gateMessage)}
              onChange={(e) => {
                const next = constrainAmountInput(e.target.value);
                if (next !== null) onAmountChange?.(next);
              }}
            />
          </div>
          {presets.length > 0 ? (
            <div className="redeem-amount-chips" role="group" aria-label="Quick redeem amounts">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`redeem-amount-chip${amountNum === p ? ' redeem-amount-chip--active' : ''}`}
                  disabled={Boolean(gateMessage) || p > maxAllowed || p < methodMin}
                  onClick={() => onAmountChange?.(String(p))}
                >
                  {formatSc(p)} SC
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {needsRecipient && copy ? (
          <div className="redeem-field">
            <label htmlFor="redeem-recipient">{copy.label}</label>
            <div className={`redeem-recipient-field${copy.prefix ? ' redeem-recipient-field--prefixed' : ''}`}>
              {copy.prefix ? (
                <span className="redeem-recipient-field__prefix" aria-hidden>
                  {copy.prefix}
                </span>
              ) : null}
              <input
                id="redeem-recipient"
                type="text"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                placeholder={copy.placeholder}
                value={
                  methodKey === 'cashapp' && recipient
                    ? recipient.startsWith('$')
                      ? recipient
                      : `$${recipient}`
                    : recipient
                }
                disabled={Boolean(gateMessage) || !method}
                onChange={(e) => {
                  let next = e.target.value.replace(/^\$+/, '');
                  if (methodKey === 'cashapp') {
                    next = next.replace(/\s+/g, '').slice(0, 64);
                  } else {
                    next = next.slice(0, 64);
                  }
                  onRecipientChange?.(next);
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="redeem-limits-hint" aria-label="Redeem limits">
          <span className="redeem-badge">
            {formatSc(methodMin)}–{formatSc(maxAllowed > 0 ? maxAllowed : withdrawMax)} SC
          </span>
          <span className="redeem-badge">5 SC steps</span>
          {neverDeposited ? <span className="redeem-badge">Capped until first purchase</span> : null}
        </div>

        {amountError ? (
          <p className="redeem-field__error" role="alert">
            {amountError}
          </p>
        ) : destError && recipient ? (
          <p className="redeem-field__error" role="alert">
            {destError}
          </p>
        ) : needsRecipient ? (
          <p className="redeem-field__hint">{method ? copy?.hint : 'Pick a payout method first.'}</p>
        ) : noRecipientHint ? (
          <p className="redeem-field__hint">{noRecipientHint}</p>
        ) : null}

        <div className="redeem-methods">
          <div className="redeem-methods__heading">
            <h2 className="redeem-methods__title">Payout method</h2>
            <span className="redeem-methods__note">One method for all payouts</span>
          </div>
          {loading && methods.length === 0 ? (
            <p className="redeem-methods__empty">Loading payout methods…</p>
          ) : methods.length === 0 ? (
            <p className="redeem-methods__empty">
              No payout methods are enabled for your store right now. Contact support and we&apos;ll sort it out.
            </p>
          ) : (
            <div className="redeem-method-grid" role="group" aria-label="Payout methods">
              {methods.map((m) => {
                const active = (m.id || m.key) === selectedMethod;
                return (
                  <button
                    key={m.id || m.key}
                    type="button"
                    className={`redeem-method-option${active ? ' redeem-method-option--active' : ''}`}
                    aria-pressed={active}
                    disabled={Boolean(gateMessage)}
                    onClick={() => onSelectMethod?.(m.id || m.key)}
                  >
                    <MethodMark methodKey={m.key} />
                    <strong>{m.label}</strong>
                    <small>
                      {formatSc(m.min)}–{formatSc(m.max)} SC
                    </small>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="redeem-submit df-premium-cta"
          disabled={!ready}
          onClick={() => onSubmit?.()}
        >
          {ctaLabel}
        </button>
      </section>

      {adminSlot}
      {historySlot}

      <RulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        withdrawMin={withdrawMin}
        withdrawMax={withdrawMax}
        dailyMax={dailyMax}
        currency={currency}
        methods={methods}
      />
    </section>
  );
}
