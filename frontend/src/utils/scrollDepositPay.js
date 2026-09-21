/**
 * After package/amount selection: scroll payment methods toward the visual
 * center of the viewport while keeping the amount summary visible above.
 */

const TOP_SAFE_PX = 88;
const BOTTOM_SAFE_MOBILE_PX = 88;
const BOTTOM_SAFE_DESKTOP_PX = 24;
const RETRY_MS = 50;
const MAX_RETRIES = 24;

function getScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function getBottomSafePx() {
  if (typeof window === 'undefined') return BOTTOM_SAFE_DESKTOP_PX;
  try {
    if (window.matchMedia('(max-width: 767px)').matches) return BOTTOM_SAFE_MOBILE_PX;
  } catch {
    /* ignore */
  }
  return BOTTOM_SAFE_DESKTOP_PX;
}

function getVisualCenterY() {
  const bottomSafe = getBottomSafePx();
  const usable = Math.max(120, window.innerHeight - TOP_SAFE_PX - bottomSafe);
  return TOP_SAFE_PX + usable / 2;
}

function applyScrollDelta(scroller, delta, behavior = 'smooth') {
  if (!Number.isFinite(delta) || Math.abs(delta) < 2) return;
  if (scroller) {
    const next = Math.max(0, scroller.scrollTop + delta);
    try {
      scroller.scrollTo({ top: next, behavior });
    } catch {
      scroller.scrollTop = next;
    }
    return;
  }
  const y = (window.scrollY || document.documentElement.scrollTop || 0) + delta;
  try {
    window.scrollTo({ top: Math.max(0, y), behavior });
  } catch {
    window.scrollTo(0, Math.max(0, y));
  }
}

/**
 * Scroll so `#deposit-pay-methods` is centered in the usable viewport,
 * without pushing `#deposit-amount-summary` above the safe top inset.
 */
export function scrollDepositPaymentMethodsIntoView({ behavior = 'smooth' } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const payEl =
    document.getElementById('deposit-pay-methods') ||
    document.querySelector('.onboarding-payment-methods');
  if (!payEl) return false;

  const summaryEl = document.getElementById('deposit-amount-summary');
  const scroller = payEl.closest('.dash-main') || getScrollParent(payEl);
  const payRect = payEl.getBoundingClientRect();
  const payCenter = payRect.top + payRect.height / 2;
  let delta = payCenter - getVisualCenterY();

  if (summaryEl) {
    const summaryTop = summaryEl.getBoundingClientRect().top;
    const summaryTopAfter = summaryTop - delta;
    if (summaryTopAfter < TOP_SAFE_PX) {
      // Keep summary fully under the safe top — payment may sit below true center.
      delta = summaryTop - TOP_SAFE_PX;
    }
  }

  applyScrollDelta(scroller, delta, behavior);
  return true;
}

/** Retry until payment methods mount after amount/package selection. */
export function scrollDepositPaymentMethodsIntoViewWhenReady(options = {}) {
  if (typeof window === 'undefined') return () => {};

  let attempts = 0;
  let timer = null;
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    if (scrollDepositPaymentMethodsIntoView(options)) return;
    attempts += 1;
    if (attempts >= MAX_RETRIES) return;
    timer = window.setTimeout(run, RETRY_MS);
  };

  // Wait one frame so React can paint amountLocked sections.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  } else {
    timer = window.setTimeout(run, 0);
  }

  // Second pass after CSS animate-in / layout settle.
  const settle = window.setTimeout(() => {
    if (!cancelled) scrollDepositPaymentMethodsIntoView(options);
  }, 220);

  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
    window.clearTimeout(settle);
  };
}
