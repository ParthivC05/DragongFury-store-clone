import { useState, useEffect, useCallback, useRef, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as walletApi from '../../api/wallet';
import { notifyDepositEligibilityChanged } from '../../utils/depositRequired';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import { formatSc } from '../../utils/currency';
import { getDepositPackageImageProps } from '../../utils/depositPackageImage';
import { PaymentQRCode } from './PaymentQRCode';
import { ChimeLogo } from '../payment/ChimeLogo';
import {
  PaymentCardIcon,
  ApplePayIcon,
  GooglePayIcon,
  CashAppIcon,
  CryptoPayIcon,
  PayPalIcon
} from '../../assets/icons';
import { cryptoUsualWait } from '../../utils/depositRails';
import './SecurePaymentModal.css';

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_DURATION_MS = 15 * 60 * 1000;
const POLL_ERROR_RETRY_COUNT = 3;
const SATS_PER_BTC = 100_000_000;

function PayingWithMark({ methodKey, label }) {
  const raw = String(methodKey || '').toLowerCase().replace(/-/g, '_');
  const key = raw.startsWith('chime') ? 'chime' : raw;
  const icons = {
    card: PaymentCardIcon,
    credit_card: PaymentCardIcon,
    debit_card: PaymentCardIcon,
    cashapp: CashAppIcon,
    chime: ChimeLogo,
    apple_pay: ApplePayIcon,
    google_pay: GooglePayIcon,
    crypto: CryptoPayIcon,
    paypal: PayPalIcon
  };
  const Icon = icons[key];
  if (!Icon) return label || '—';
  const isDark = key === 'apple_pay';
  return (
    <span className={`spm-pj-paywith${isDark ? ' is-dark' : ''}`} aria-label={label || undefined}>
      <Icon />
    </span>
  );
}

/** Format SATS as BTC string (e.g. "0.00014067") */
function formatSatsToBtc(sats) {
  if (sats == null || Number.isNaN(Number(sats))) return null;
  const btc = Number(sats) / SATS_PER_BTC;
  const str = btc.toFixed(8);
  const trimmed = parseFloat(str).toString();
  return trimmed;
}

/** Format number with locale thousands separator */
function formatNumber(num) {
  if (num == null || Number.isNaN(Number(num))) return '—';
  return Number(num).toLocaleString();
}

/** Crypto amounts are often < 0.001 — default toLocaleString rounds those to 0. */
function formatCryptoAmount(num) {
  if (num == null || Number.isNaN(Number(num))) return '—';
  const n = Number(num);
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const maxFrac = abs >= 1 ? 6 : 8;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: abs >= 1 ? 2 : 4,
    maximumFractionDigits: maxFrac,
    useGrouping: false
  });
}

function formatPayAmount(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  return Number.isInteger(n) ? n.toLocaleString() : formatSc(n);
}

function HandoffCoin({ size = 20 }) {
  const rawId = useId();
  const gradId = `pj-coin-${rawId.replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#B8801B" />
      <circle cx="12" cy="12" r="9" fill={`url(#${gradId})`} />
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE49A" />
          <stop offset="1" stopColor="#E9A526" />
        </linearGradient>
      </defs>
      <path
        d="M12 6.5v11M9.4 9.2h4a1.7 1.7 0 010 3.4h-3.4a1.7 1.7 0 000 3.4h4"
        stroke="#8A5A0C"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function ConfettiBurst({ active }) {
  const pieces = useMemo(() => {
    if (!active) return [];
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return [];
    }
    const colors = ['#FFC94A', '#42E294', '#6BD2FF', '#FFE9AC', '#9BF5C8'];
    return Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}vw`,
      color: colors[i % colors.length],
      delay: `${Math.random() * 0.5}s`,
      duration: `${1.6 + Math.random() * 1.4}s`,
    }));
  }, [active]);

  if (!active) return null;
  return (
    <div className="spm-pj-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.id}
          className="spm-pj-cf"
          style={{
            left: p.left,
            background: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}

function ReceiptArt({ sc }) {
  const n = Number(sc);
  const idx = Number.isFinite(n) && n >= 100 ? 2 : Number.isFinite(n) && n >= 40 ? 1 : 0;
  return (
    <div className="spm-pj-rcp-art">
      <span className="spm-pj-rcp-glow" aria-hidden="true" />
      <img {...getDepositPackageImageProps(idx)} alt="" />
    </div>
  );
}

/**
 * DollarPay round-trip handoff — get the tap, get the player back.
 * Amount + SC are dynamic; GC is intentionally omitted.
 * ready → user taps Pay → open tab → waiting
 */
function DollarPayHandoff({
  amount,
  currency = 'USD',
  creditSc,
  saveLabel = '—',
  packageValue = null,
  discountPct = 0,
  payingWithLabel = '—',
  payingWithKey = '',
  status,
  statusMessage,
  handedOff,
  dollarpayTabBlocked,
  paymentUrl,
  onStartPayment,
  onOpenPayment,
  onCheckNow,
  checking,
  onCancel,
  onOpenTerms,
  onClose,
}) {
  const [secs, setSecs] = useState(0);
  const [showRetryHint, setShowRetryHint] = useState(false);
  const [pfI, setPfI] = useState(0);
  const isTerminal = status === 'completed' || status === 'failed' || status === 'expired' || status === 'closed';
  const isFailed = status === 'failed' || status === 'expired' || status === 'closed';
  const phase = isTerminal
    ? status === 'completed'
      ? 'paid'
      : 'failed'
    : checking
      ? 'checking'
      : handedOff
        ? 'waiting'
        : 'ready';
  const coinPos = phase === 'ready' ? 18 : phase === 'paid' ? 82 : 50;
  const railFill = phase === 'ready' ? 0 : phase === 'paid' ? 64 : 32;
  const payLabel = currency === 'USD' || !currency ? 'USD' : currency;
  const amountText = formatPayAmount(amount);
  const scText =
    creditSc != null && Number.isFinite(Number(creditSc))
      ? formatSc(creditSc)
      : null;
  const saveAmt =
    packageValue != null && Number.isFinite(Number(packageValue)) && Number(packageValue) > Number(amount)
      ? Number(packageValue) - Number(amount)
      : 0;
  const pkgValueLabel =
    packageValue != null && Number.isFinite(Number(packageValue))
      ? `$${formatPayAmount(packageValue)}`
      : scText != null
        ? `$${scText}`
        : '—';
  const payToday = payLabel === 'USD' ? `$${amountText}` : `${payLabel} ${amountText}`;
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const retKind = phase === 'paid' ? 'fin' : phase === 'waiting' || phase === 'checking' ? 'hot' : '';
  const noteWarn = phase === 'waiting' || phase === 'checking';

  useEffect(() => {
    if (phase !== 'waiting') {
      if (phase === 'ready') {
        setSecs(0);
        setShowRetryHint(false);
      }
      return undefined;
    }
    setSecs(0);
    setShowRetryHint(false);
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    const hint = setTimeout(() => setShowRetryHint(true), 6000);
    return () => {
      clearInterval(tick);
      clearTimeout(hint);
    };
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => setPfI((i) => i + 1), 4200);
    return () => clearInterval(id);
  }, []);

  const pfLines = [
    scText ? (
      <>
        <b>{scText} SC</b> is one of today&apos;s popular picks
      </>
    ) : (
      <>This pack is one of today&apos;s popular picks</>
    ),
    <>
      Coins usually arrive in <b>under 60 seconds</b>
    </>,
    phase === 'waiting' ? (
      <>
        Waiting for your payment · <b>{mmss}</b>
      </>
    ) : (
      <>Finish paying, then come back here</>
    ),
  ];

  const nodes = [
    { label: 'Here', icon: 'home' },
    { label: 'Pay page', icon: 'card' },
    { label: 'Back here', icon: 'gift' },
  ];
  const nodeState = (idx) => {
    if (phase === 'paid') return 'ok';
    if (phase === 'ready') return idx === 0 ? 'on' : '';
    return idx === 0 ? 'ok' : idx === 1 ? 'on' : '';
  };

  return (
    <div className="spm-pj flex-1 min-h-0">
      <ConfettiBurst active={phase === 'paid'} />
      <div className="spm-pj-shell">
        <header className="spm-pj-header">
          <span className="spm-pj-lock" aria-hidden="true">🔒</span>
          <h2 className="spm-pj-header-title">Secure payment</h2>
          <button
            type="button"
            aria-label="Close"
            className="spm-pj-close"
            onClick={() => onClose(status === 'completed')}
          >
            ✕
          </button>
        </header>

        {!isFailed && (
          <div className={`spm-pj-ret${retKind ? ` is-${retKind}` : ''}`}>
            <span className="spm-pj-ret-a" aria-hidden="true">
              {phase === 'paid' ? '✅' : '↩︎'}
            </span>
            <div className="spm-pj-ret-tx">
              <div className="spm-pj-ret-t">
                {phase === 'paid'
                  ? 'You came back — coins delivered'
                  : phase === 'waiting' || phase === 'checking'
                    ? 'Come back here after you pay'
                    : 'Come back to this screen after you pay'}
              </div>
              <div className="spm-pj-ret-s">
                {phase === 'paid'
                  ? 'That is exactly how it works every time'
                  : 'This is the only place your coins can land'}
              </div>
            </div>
          </div>
        )}

        <div className="spm-pj-body">
          {!isFailed && (
            <>
              <div className="spm-pj-rcp">
                <ReceiptArt sc={creditSc} />
                <div className="spm-pj-rcp-tx">
                  <div className="spm-pj-rcp-n">{scText != null ? scText : '—'}</div>
                  <div className="spm-pj-rcp-u">SWEEPS COINS</div>
                  {saveAmt > 0 && (
                    <span className="spm-pj-rcp-f">+${formatPayAmount(saveAmt)} free included</span>
                  )}
                </div>
              </div>

              <div className="spm-pj-rows">
                <div className="spm-pj-rw">
                  <span className="spm-pj-k">Paying with</span>
                  <span className="spm-pj-v">
                    <span className="spm-pj-plogo">
                      <PayingWithMark methodKey={payingWithKey} label={payingWithLabel} />
                    </span>
                  </span>
                </div>
                <div className="spm-pj-rw">
                  <span className="spm-pj-k">Package value</span>
                  <span className={`spm-pj-v${Number(packageValue) > Number(amount) ? ' is-st' : ''}`}>
                    {pkgValueLabel}
                  </span>
                </div>
                <div className="spm-pj-rw">
                  <span className="spm-pj-k">Discount</span>
                  <span className="spm-pj-v is-gd">{Number(discountPct) > 0 ? `− ${discountPct}%` : 'None'}</span>
                </div>
                <div className="spm-pj-rw">
                  <span className="spm-pj-k">You save</span>
                  <span className="spm-pj-v is-mn">{saveLabel || '—'}</span>
                </div>
                <div className="spm-pj-rw is-tot">
                  <span className="spm-pj-k">You pay today</span>
                  <span className="spm-pj-v">{payToday}</span>
                </div>
              </div>
            </>
          )}

          {!isFailed && (
            <div className="spm-pj-trip" aria-hidden="true">
              <div className="spm-pj-tl" />
              <div
                className={`spm-pj-td${phase === 'paid' ? ' is-done' : ''}`}
                style={{ width: `${railFill}%` }}
              />
              <div className="spm-pj-tc" style={{ left: `calc(${coinPos}% - 11px)` }}>
                {phase === 'waiting' && (
                  <>
                    <span className="spm-pj-ring" />
                    <span className="spm-pj-ring spm-pj-ring--delay" />
                  </>
                )}
                <span className={phase === 'checking' ? 'spm-pj-spin' : 'spm-pj-coin-bob'}>
                  <HandoffCoin size={22} />
                </span>
              </div>
              {nodes.map((n, idx) => {
                const state = nodeState(idx);
                return (
                  <div key={n.label} className={`spm-pj-nd${state ? ` is-${state}` : ''}`}>
                    <div className="spm-pj-nd-c">
                      {n.icon === 'home' && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" />
                        </svg>
                      )}
                      {n.icon === 'card' && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <rect x="3" y="6" width="18" height="12" rx="2" />
                          <path d="M3 10h18" />
                        </svg>
                      )}
                      {n.icon === 'gift' && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <rect x="4" y="10" width="16" height="10" rx="1.5" />
                          <path d="M12 10v10M4 14h16M12 10c-2.5 0-4-1.6-4-3.2S9.5 4 12 6.2C14.5 4 16 5.2 16 6.8S14.5 10 12 10z" />
                        </svg>
                      )}
                    </div>
                    <span className="spm-pj-nd-l">{n.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!isFailed && (
            <div className={`spm-pj-nt${noteWarn ? ' is-w' : ''}`}>
              <div className="spm-pj-nt-i" aria-hidden="true">{phase === 'paid' ? '🎁' : '↩︎'}</div>
              <div>
                <h3>
                  {phase === 'paid'
                    ? `${scText != null ? `${scText} SC` : 'Coins'} is in your balance`
                    : phase === 'waiting' || phase === 'checking'
                      ? 'Finish paying, then come back'
                      : 'Come back to this screen'}
                </h3>
                <p>
                  {phase === 'paid'
                    ? 'All done. Your coins are ready to play right now.'
                    : phase === 'waiting' || phase === 'checking'
                      ? 'The payment page opened in another window. Finish there, then return and tap the green button.'
                      : "Coins land only when you return here after paying. Don't close this page."}
                </p>
              </div>
            </div>
          )}

          {!isFailed && (
            <div className="spm-pj-pf">
              <span className="spm-pj-pd" aria-hidden="true" />
              <span>{pfLines[pfI % pfLines.length]}</span>
            </div>
          )}

          {isFailed && (
            <div className="spm-pj-fail">
              <h3>
                {status === 'closed'
                  ? 'Payment closed'
                  : status === 'expired'
                    ? 'Payment expired'
                    : 'Payment failed'}
              </h3>
              <p>
                {statusMessage ||
                  (status === 'closed'
                    ? 'This payment was closed. Please start a new deposit.'
                    : status === 'expired'
                      ? 'This payment timed out. Please start a new deposit.'
                      : 'Something went wrong. Please try again.')}
              </p>
            </div>
          )}

          {statusMessage && !isFailed && status !== 'completed' && (
            <p className="spm-pj-status-msg">{statusMessage}</p>
          )}
        </div>

        <div className="spm-pj-pa">
          {phase === 'ready' && (
            <>
              <button
                type="button"
                className="spm-pj-big is-gold is-blink"
                onClick={onStartPayment}
                disabled={!paymentUrl}
              >
                <span className="spm-pj-big-l1">Pay {payToday}</span>
                <span className="spm-pj-big-l2">and come back to this screen</span>
              </button>
              <p className="spm-pj-sl2">Takes about 60 seconds.</p>
              <button type="button" className="spm-pj-cx" onClick={onCancel}>
                Cancel this payment
              </button>
            </>
          )}

          {phase === 'waiting' && (
            <>
              {dollarpayTabBlocked && (
                <p className="spm-pj-blocked">
                  We couldn’t open the payment page. Tap below to continue.
                </p>
              )}
              {dollarpayTabBlocked ? (
                <button
                  type="button"
                  className="spm-pj-big is-gold is-blink"
                  onClick={onOpenPayment}
                  disabled={!paymentUrl}
                >
                  <span className="spm-pj-big-l1">Open payment page</span>
                  <span className="spm-pj-big-l2">then come back to this screen</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="spm-pj-big is-mint is-blink"
                  onClick={onCheckNow}
                  disabled={checking}
                >
                  <span className="spm-pj-big-l1">I have paid — add my coins</span>
                  <span className="spm-pj-big-l2">Tap this once you finish paying</span>
                </button>
              )}
              <p className="spm-pj-sl2">Waiting for your payment · {mmss}</p>
              {!dollarpayTabBlocked && (
                <button
                  type="button"
                  className="spm-pj-again"
                  onClick={onOpenPayment}
                  disabled={!paymentUrl}
                >
                  Open payment page again
                </button>
              )}
              {showRetryHint && !dollarpayTabBlocked && (
                <p className="spm-pj-sl2">Page didn’t open? Tap Open payment page again.</p>
              )}
              <button type="button" className="spm-pj-cx" onClick={onCancel}>
                I changed my mind — cancel
              </button>
            </>
          )}

          {phase === 'checking' && (
            <div className="spm-pj-checking">
              <div className="spm-pj-check-bar">
                <div className="spm-pj-check-fill" />
              </div>
              <p className="spm-pj-checking-title">Checking your payment…</p>
              <p className="spm-pj-sl2">This takes a few seconds.</p>
            </div>
          )}

          {isFailed && (
            <button type="button" className="spm-pj-big is-mint" onClick={() => onClose(false)}>
              <span className="spm-pj-big-l1">Close</span>
            </button>
          )}

          {phase === 'paid' && (
            <>
              <button type="button" className="spm-pj-big is-mint" onClick={() => onClose(true)}>
                <span className="spm-pj-big-l1">Start playing</span>
                <span className="spm-pj-big-l2">Back to the games</span>
              </button>
              <p className="spm-pj-sl2">A receipt is in your purchases.</p>
              <button type="button" className="spm-pj-cx" onClick={() => onClose(true)}>
                Close
              </button>
            </>
          )}

          <p className="spm-pj-ft">
            Payments are encrypted
            {onOpenTerms && (
              <>
                {' · '}
                <button type="button" className="spm-pj-terms" onClick={onOpenTerms}>
                  Terms &amp; Policy
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Countdown seconds remaining until expiresAt; updates every second. Returns null if no expiry. */
function useCountdown(expiresAt, ttl) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!expiresAt && !ttl) return setRemaining(null);
    const tick = () => {
      const end = expiresAt ? new Date(expiresAt).getTime() : Date.now() + (Number(ttl) || 0) * 1000;
      const sec = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRemaining(sec);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, ttl]);
  return remaining;
}

/** Copy button: label with icon, shows "✔ Copied!" after copy */
function CopyInvoiceButton({ value, label = 'Copy Lightning Invoice' }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [value]);
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!value}
      className={`spm-copy-btn ${copied ? 'copied' : ''}`}
    >
      {copied ? (
        <>✔ Copied!</>
      ) : (
        <>📋 {label}</>
      )}
    </button>
  );
}

/** Speed in-app payment content – fintech-style layout */
function SpeedPaymentContent({ sessionPayload, status, statusMessage, onClose }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const expiresAt = sessionPayload?.expiresAt ?? null;
  const ttl = sessionPayload?.ttl ?? null;
  const remaining = useCountdown(expiresAt, ttl);
  const qrPayload = sessionPayload?.qrPayload || sessionPayload?.address || sessionPayload?.paymentRequest || sessionPayload?.walletAddress || sessionPayload?.paymentUri;
  const address = sessionPayload?.address ?? sessionPayload?.walletAddress ?? null;
  const paymentRequest = sessionPayload?.paymentRequest ?? sessionPayload?.paymentUri ?? null;
  const paymentMethod = sessionPayload?.paymentMethod ?? '';
  const isLightning = paymentMethod === 'lightning';
  const isOnchain = paymentMethod === 'onchain';
  const targetCurrency = sessionPayload?.targetCurrency ?? '';
  const targetAmount = sessionPayload?.targetAmount != null ? Number(sessionPayload.targetAmount) : null;
  const btcAmount = targetCurrency === 'SATS' && targetAmount != null ? formatSatsToBtc(targetAmount) : null;

  const wait = cryptoUsualWait({ currency: targetCurrency, paymentMethod });

  const pageTitle = isLightning
    ? 'Pay with Bitcoin Lightning'
    : isOnchain
      ? 'Pay with Bitcoin (on-chain)'
      : `Pay with ${targetCurrency || 'Crypto'}`;

  const instructionText = isLightning
    ? 'Scan the QR code with your Lightning wallet or copy the payment invoice.'
    : address
      ? 'Scan the QR code with your wallet or copy the address below.'
      : 'Scan the QR code with your wallet to complete the payment.';

  const statusConfig = {
    completed: { label: 'Payment Received', emoji: '✅', className: 'spm-status-completed' },
    confirming: { label: 'Confirming', emoji: '🟢', className: 'spm-status-completed' },
    pending: { label: 'Payment Pending', emoji: '🟡', className: 'spm-status-pending' },
    unpaid: { label: 'Payment Pending', emoji: '🟡', className: 'spm-status-pending' },
    expired: { label: 'Expired', emoji: '🔴', className: 'spm-status-expired' },
    closed: { label: 'Closed', emoji: '🔴', className: 'spm-status-expired' },
    failed: { label: 'Failed', emoji: '🔴', className: 'spm-status-failed' }
  };
  const statusInfo = statusConfig[status] || { label: status, emoji: '🟡', className: 'spm-status-pending' };

  const isTerminal = status === 'completed' || status === 'expired' || status === 'closed' || status === 'failed';
  const showPaymentFlow = !isTerminal && (qrPayload || address);

  return (
    <div className="secure-payment-modal flex-1 overflow-auto bg-[#0f1419]">
      <div className="spm-container">
        {/* 1. Page title */}
        <h1 className="spm-title">{pageTitle}</h1>

        {/* 2. Amount – top, large */}
        <div className="spm-amount-block">
          <div className="spm-amount-fiat">
            {sessionPayload?.currency || 'USD'} {sessionPayload?.amount != null ? formatNumber(sessionPayload.amount) : '—'}
          </div>
          {(targetAmount != null || targetCurrency) && (
            <div className="spm-amount-crypto">
              {targetAmount != null && (
                <>
                  Send {formatCryptoAmount(targetAmount)} {targetCurrency}
                  {btcAmount != null && (
                    <span className="block spm-btc mt-0.5">≈ {btcAmount} BTC</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Payment instruction */}
        <p className="spm-instruction">{instructionText}</p>
        {wait?.long ? (
          <p className={`spm-eta${isLightning ? ' fast' : ''}`}>{wait.long}</p>
        ) : null}

        {/* 3. Status badge */}
        <div className="flex justify-center">
          <span className={`spm-status-badge ${statusInfo.className}`}>
            <span>{statusInfo.emoji}</span>
            <span>{statusInfo.label}</span>
          </span>
        </div>

        {/* Expired / closed / failed */}
        {(status === 'failed' || status === 'expired' || status === 'closed') && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 space-y-4">
            <p className="text-red-200 font-medium text-center">
              {status === 'closed'
                ? 'This payment was closed.'
                : status === 'expired'
                  ? 'This payment session has expired.'
                  : 'Payment failed.'}
            </p>
            {statusMessage && (
              <p className="text-sm text-gray-400 text-center">{statusMessage}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="spm-btn-primary"
              >
                {status === 'expired' || status === 'closed' ? 'Create new deposit' : 'Try again'}
              </button>
              <button
                type="button"
                onClick={() => onClose(false)}
                className="w-full py-3 rounded-xl border border-gray-500 text-gray-300 font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* 4. QR code – center card */}
        {showPaymentFlow && (
          <>
            <div className="spm-qr-card">
              <p className="spm-qr-label">Scan to Pay</p>
              <div className="spm-qr-wrap">
                <PaymentQRCode payload={qrPayload} size={240} theme="light" />
              </div>
              {(expiresAt || ttl) != null && remaining != null && remaining > 0 && (
                <p className={`spm-timer ${remaining <= 60 ? 'spm-timer-pulse text-amber-400' : ''}`}>
                  ⏳ Invoice expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                </p>
              )}
              {remaining === 0 && (
                <p className="spm-timer text-red-400">Invoice expired</p>
              )}
            </div>

            {/* 5. Collapsible: Lightning invoice */}
            {paymentRequest && !address && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setInvoiceOpen((o) => !o)}
                  className="spm-collapse-trigger"
                >
                  <span>Show Lightning Invoice</span>
                  <span className="text-gray-500">{invoiceOpen ? '▼' : '▶'}</span>
                </button>
                {invoiceOpen && (
                  <div className="spm-collapse-body">
                    <p className="spm-invoice-short">
                      {paymentRequest.length > 24
                        ? `${paymentRequest.slice(0, 12)}...${paymentRequest.slice(-8)}`
                        : paymentRequest}
                    </p>
                    <CopyInvoiceButton value={paymentRequest} label="Copy Lightning Invoice" />
                  </div>
                )}
              </div>
            )}

            {/* 5b. Address always visible — QR is a helper, copy is the fallback */}
            {address && (
              <div className="mb-4 spm-address-block">
                <p className="spm-qr-label">Wallet address</p>
                <p className="spm-invoice-full">{address}</p>
                <CopyInvoiceButton value={address} label="Copy Address" />
              </div>
            )}

            {/* 6. How to pay */}
            {(isLightning || isOnchain) && (
              <div className="spm-help-card">
                <h3 className="spm-help-title">How to pay</h3>
                <ol className="spm-help-list">
                  {isLightning ? (
                    <>
                      <li data-step="1.">Open your Lightning wallet</li>
                      <li data-step="2.">Tap &quot;Scan&quot;</li>
                      <li data-step="3.">Scan the QR code</li>
                      <li data-step="4.">Confirm the payment</li>
                    </>
                  ) : (
                    <>
                      <li data-step="1.">Open your Bitcoin wallet</li>
                      <li data-step="2.">Tap &quot;Send&quot; or &quot;Scan&quot;</li>
                      <li data-step="3.">Scan the QR code or paste the address</li>
                      <li data-step="4.">Confirm the transaction</li>
                    </>
                  )}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SecurePaymentModal({
  open,
  onClose,
  onPaymentSuccess,
  depositId,
  sessionPayload,
  creditSc = null,
  saveLabel = null,
  payingWithLabel = null,
  payingWithKey = null,
  onOpenTerms,
}) {
  const [status, setStatus] = useState(sessionPayload?.status || 'pending');
  const [statusMessage, setStatusMessage] = useState(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [showPollError, setShowPollError] = useState(false);
  const [dollarpayTabBlocked, setDollarpayTabBlocked] = useState(false);
  const [dollarpayChecking, setDollarpayChecking] = useState(false);
  const [dollarpayHandedOff, setDollarpayHandedOff] = useState(false);
  const iframeRef = useRef(null);
  const dollarpayTabRef = useRef(null);
  const successNotifiedRef = useRef(false);
  const dollarpayCheckTimerRef = useRef(null);

  const successCurrency =
    sessionPayload?.currency === 'SC' ? 'USD' : (sessionPayload?.currency || 'USD');

  const notifyPaymentSuccess = useCallback(() => {
    if (successNotifiedRef.current) return;
    successNotifiedRef.current = true;
    try {
      dollarpayTabRef.current?.close?.();
    } catch (_) {
      /* ignore */
    }
    dollarpayTabRef.current = null;
    window.dispatchEvent(new Event('wallet:refresh'));
    notifyDepositEligibilityChanged();
    if (typeof onPaymentSuccess === 'function') {
      onPaymentSuccess({
        amount: sessionPayload?.amount,
        currency: successCurrency,
        variant: 'credited',
      });
    }
  }, [onPaymentSuccess, sessionPayload?.amount, successCurrency]);

  const handleClose = useCallback((didSucceed) => {
    if (typeof onClose === 'function') {
      onClose({ success: didSucceed === true });
    }
  }, [onClose]);

  const paymentUrl = sessionPayload?.paymentUrl || sessionPayload?.embeddedFormConfig?.url || '';

  const openDollarpayTab = useCallback(() => {
    if (!paymentUrl) return false;
    // Do not pass noopener here — it makes window.open() return null and looks "blocked".
    const win = window.open(paymentUrl, '_blank');
    if (!win) {
      setDollarpayTabBlocked(true);
      return false;
    }
    try {
      win.opener = null;
    } catch (_) {
      /* ignore */
    }
    dollarpayTabRef.current = win;
    setDollarpayTabBlocked(false);
    try {
      win.focus();
    } catch (_) {
      /* ignore */
    }
    return true;
  }, [paymentUrl]);

  const startDollarpayPayment = useCallback(() => {
    openDollarpayTab();
    setDollarpayHandedOff(true);
  }, [openDollarpayTab]);

  const checkDollarpayNow = useCallback(async () => {
    if (!depositId || dollarpayChecking) return;
    setDollarpayChecking(true);
    if (dollarpayCheckTimerRef.current) {
      clearTimeout(dollarpayCheckTimerRef.current);
      dollarpayCheckTimerRef.current = null;
    }
    try {
      const res = await walletApi.getDepositStatus(depositId);
      const s = res?.status || status;
      setStatus(s);
      if (res?.message) setStatusMessage(res.message);
      if (s === 'completed') {
        setDollarpayChecking(false);
        notifyPaymentSuccess();
        return;
      }
      if (s === 'failed' || s === 'expired' || s === 'closed') {
        setStatusMessage(
          res?.message ||
            (s === 'closed'
              ? 'This payment was closed.'
              : s === 'expired'
                ? 'This payment session has expired.'
                : 'Payment failed.')
        );
        setDollarpayChecking(false);
        return;
      }
    } catch (_) {
      /* keep waiting UI; automatic poll will retry */
    }
    dollarpayCheckTimerRef.current = setTimeout(() => {
      setDollarpayChecking(false);
      dollarpayCheckTimerRef.current = null;
    }, 1800);
  }, [depositId, dollarpayChecking, status, notifyPaymentSuccess]);

  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = lockBodyScroll({ reserveScrollPosition: true });
    document.body.classList.add('payment-iframe-active');
    return () => {
      document.body.classList.remove('payment-iframe-active');
      releaseScrollLock();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      successNotifiedRef.current = false;
      setDollarpayTabBlocked(false);
      setDollarpayChecking(false);
      setDollarpayHandedOff(false);
      dollarpayTabRef.current = null;
      if (dollarpayCheckTimerRef.current) {
        clearTimeout(dollarpayCheckTimerRef.current);
        dollarpayCheckTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (sessionPayload?.status) setStatus(sessionPayload.status);
    else setStatus('pending');
    setStatusMessage(null);
    setPollErrorCount(0);
    setShowPollError(false);
    setDollarpayChecking(false);
    setDollarpayHandedOff(false);
    setDollarpayTabBlocked(false);
    successNotifiedRef.current = false;
  }, [sessionPayload?.depositId, sessionPayload?.status]);

  useEffect(() => {
    if (!open || status !== 'completed') return;
    const providerCode = sessionPayload?.providerCode || '';
    if (providerCode === 'scrypto' || providerCode === 'selfcrypto' || providerCode === 'dollarpay' || providerCode === 'xxpay') {
      notifyPaymentSuccess();
    }
  }, [open, status, sessionPayload?.providerCode, notifyPaymentSuccess]);

  const pollIntervalRef = useRef(null);
  useEffect(() => {
    const providerCode = sessionPayload?.providerCode || '';
    const shouldPollStatus =
      providerCode === 'scrypto' || providerCode === 'selfcrypto' || providerCode === 'dollarpay' || providerCode === 'xxpay';
    if (!open || !depositId || !shouldPollStatus) return;
    let cancelled = false;
    const startedAt = Date.now();
    const poll = async () => {
      if (cancelled || Date.now() - startedAt > POLL_MAX_DURATION_MS) return;
      try {
        const res = await walletApi.getDepositStatus(depositId);
        if (cancelled) return;
        setPollErrorCount(0);
        const s = res?.status || status;
        setStatus(s);
        if (res?.message) setStatusMessage(res.message);
        if (s === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          notifyPaymentSuccess();
          return;
        }
      if (s === 'failed' || s === 'expired' || s === 'closed') {
        setStatusMessage(
          res?.message ||
            (s === 'closed'
              ? 'This payment was closed.'
              : s === 'expired'
                ? 'This payment session has expired.'
                : 'Payment failed.')
        );
        return;
      }
      } catch (_) {
        if (cancelled) return;
        setPollErrorCount((n) => {
          const next = n + 1;
          if (next >= POLL_ERROR_RETRY_COUNT) {
            setShowPollError(true);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
          return next;
        });
      }
    };
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => {
      cancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [open, depositId, status, notifyPaymentSuccess, sessionPayload?.providerCode]);

  useEffect(() => {
    const providerCode = sessionPayload?.providerCode || '';
    const isOrionstarspay = providerCode === 'orionstarspay';
    if (!open || !isOrionstarspay) return;
    const handler = (event) => {
      if (event.origin !== window.location.origin) return;
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;

      const type = event?.data?.type || event?.data?.event || '';
      if (type === 'PAYMENT_COMPLETE') {
        const messageDepositId = event?.data?.depositId;
        if (
          messageDepositId != null &&
          depositId != null &&
          String(messageDepositId) !== String(depositId)
        ) {
          return;
        }
        notifyPaymentSuccess();
        return;
      }
      if (type === 'PAYMENT_CLOSE' || type === 'PAYMENT_CLOSED' || type === 'CLOSE_MODAL') {
        handleClose(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, depositId, handleClose, notifyPaymentSuccess, sessionPayload?.providerCode]);

  if (!open) return null;

  const providerCode = sessionPayload?.providerCode || '';
  const isOrionstarspay = providerCode === 'orionstarspay';
  const isScrypto = providerCode === 'scrypto' || providerCode === 'selfcrypto';
  const isDollarpay = providerCode === 'dollarpay';
  const isXxpay = providerCode === 'xxpay';
  // Orion embeds in-iframe; DollarPay / XXPay use the new-tab handoff.
  const usesPaymentIframe = isOrionstarspay;
  const usesExternalHandoff = isDollarpay || isXxpay;
  const resolvedCreditSc =
    sessionPayload?.creditSc != null && Number.isFinite(Number(sessionPayload.creditSc))
      ? Number(sessionPayload.creditSc)
      : creditSc != null && Number.isFinite(Number(creditSc))
        ? Number(creditSc)
        : null;

  const modal = (
    <div
      className={`secure-payment-modal fixed inset-0 z-[10080] flex flex-col overflow-hidden ${
        usesPaymentIframe
          ? 'secure-payment-modal--iframe-only'
          : usesExternalHandoff
            ? 'secure-payment-modal--dollarpay'
            : 'bg-[#0f1419] border border-gray-700/50 shadow-2xl'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={usesPaymentIframe ? 'Payment' : 'Secure payment'}
    >
      {usesPaymentIframe ? (
        <header className="spm-iframe-header">
          <span className="spm-iframe-header-title">Secure Payment</span>
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="spm-iframe-header-close"
          >
            Close
          </button>
        </header>
      ) : !usesExternalHandoff ? (
        <header className="flex items-center justify-between flex-shrink-0 px-4 py-3 border-b border-white/10 bg-[#1a2332]">
          <span className="text-base font-semibold text-gray-100">Secure Payment</span>
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="py-2 px-4 rounded-xl font-medium text-gray-200 bg-white/10 hover:bg-white/15 transition"
          >
            Close
          </button>
        </header>
      ) : null}

      <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        {showPollError && (
          <div className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mx-4 mt-4 space-y-2">
            <p className="text-amber-200 font-medium text-center">
              Unable to verify status; check your balance or history.
            </p>
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="w-full py-2.5 rounded-xl bg-[#f7931a] text-white font-semibold text-sm"
            >
              Close
            </button>
          </div>
        )}
        {usesPaymentIframe && (
          <div className="spm-iframe-shell flex-1 min-h-0 flex flex-col">
            <iframe
              ref={iframeRef}
              title="Secure payment"
              src={paymentUrl}
              className="spm-iframe flex-1 w-full min-h-0 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
              allow="payment"
            />
            {onOpenTerms && (
              <div className="spm-iframe-terms shrink-0 flex items-center justify-center px-3 py-2.5 text-center">
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="spm-iframe-terms-link focus:outline-none focus:ring-2 focus:ring-[var(--dash-gold)]/50 rounded"
                >
                  Secure payment &amp; wallet. Please read our Terms &amp; Policy.
                </button>
              </div>
            )}
          </div>
        )}

        {usesExternalHandoff && (
          <DollarPayHandoff
            amount={sessionPayload?.amount}
            currency={sessionPayload?.currency || 'USD'}
            creditSc={resolvedCreditSc}
            saveLabel={sessionPayload?.saveLabel || saveLabel || '—'}
            packageValue={sessionPayload?.packageValue ?? null}
            discountPct={sessionPayload?.discountPct ?? 0}
            payingWithLabel={sessionPayload?.payingWithLabel || payingWithLabel || '—'}
            payingWithKey={sessionPayload?.payingWithKey || payingWithKey || ''}
            status={status}
            statusMessage={statusMessage}
            handedOff={dollarpayHandedOff}
            dollarpayTabBlocked={dollarpayTabBlocked}
            paymentUrl={paymentUrl}
            onStartPayment={startDollarpayPayment}
            onOpenPayment={openDollarpayTab}
            onCheckNow={checkDollarpayNow}
            checking={dollarpayChecking}
            onCancel={() => handleClose(false)}
            onOpenTerms={onOpenTerms}
            onClose={handleClose}
          />
        )}

        {isScrypto && (
          <div className="flex-1 min-h-0 overflow-auto">
            <SpeedPaymentContent
              sessionPayload={sessionPayload}
              status={status}
              statusMessage={statusMessage}
              onClose={handleClose}
            />
          </div>
        )}

        {!usesPaymentIframe && !isScrypto && !usesExternalHandoff && (
          <div className="flex-1 flex items-center justify-center p-6 text-gray-400">
            Unknown payment provider. Please close and try again.
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
