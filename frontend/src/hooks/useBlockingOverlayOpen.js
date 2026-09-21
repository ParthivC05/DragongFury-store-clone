import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const BODY_MODAL_LOCK_CLASSES = [
  'welcome-modal-open',
  'guest-spin-modal-open',
  'game-transfer-modal-open',
  'onboarding-tutorial-active',
  'page-loader-active',
  'payment-iframe-active',
  'slot-game-play-active',
  'slot-game-mode',
];

/** Body classes that mean the user is mid-flow — dashboard promo modals should wait. */
const PROMO_DEFER_BODY_CLASSES = [
  'game-transfer-modal-open',
  'onboarding-tutorial-active',
  'page-loader-active',
  'payment-iframe-active',
  'slot-game-play-active',
  'slot-game-mode',
];

const OVERLAY_SELECTORS = [
  '.fdb-backdrop',
  '.gtm-backdrop',
  '.wbm-backdrop',
  '.pss-backdrop',
  '.rsm-backdrop',
  '.swr-result-backdrop',
  '.dash-chime-modal-backdrop',
  '.dash-chime-modal-root',
  '.dash-menu-drawer-backdrop',
  '.dash-wallet-breakdown-backdrop',
  '.lp-guest-spin-modal-backdrop',
  '.lp-guest-win-backdrop',
  '[data-radix-dialog-overlay][data-state="open"]',
  '.onb-backdrop-overlay',
].join(', ');

/** User-facing overlays that should block promo popups (excludes dashboard promo modals). */
const PROMO_DEFER_OVERLAY_SELECTORS = [
  '.gtm-backdrop',
  '.pss-backdrop',
  '.swr-result-backdrop',
  '.dash-chime-modal-backdrop',
  '.dash-chime-modal-root',
  '.dash-menu-drawer-backdrop',
  '.dash-wallet-breakdown-backdrop',
  '[data-radix-dialog-overlay][data-state="open"]',
  '.onb-backdrop-overlay',
  '.pj-verify-overlay',
].join(', ');

/** Title ids belonging to scheduled dashboard promo modals (spin / first-deposit / invite / daily bonus). */
const DASHBOARD_PROMO_MODAL_TITLE_SELECTOR =
  '#swr-modal-title, #fdb-modal-title, #rfx-modal-title, #daily-bonus-title, #db-claim-result-title, #dbt-modal-title, #custom-promo-modal';

const OVERLAY_POLL_MS = 800;
/** After deposit/withdraw (etc.) closes, wait before showing a deferred promo. */
const PROMO_DEFER_RETRY_MS = 500;
const PROMO_AFTER_BUSY_DELAY_MS = 3_500;

function isVisible(el) {
  if (!el?.isConnected) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  const opacity = Number.parseFloat(style.opacity);
  if (!Number.isNaN(opacity) && opacity <= 0.01) return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

function hasVisibleOverlay() {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTORS)).some(isVisible);
}

/** True while the Daily Bonus tracker or claim-result modal is visible. */
export function isDailyBonusModalOpen() {
  if (document.getElementById('db-claim-result-title')) return true;
  if (document.getElementById('dbt-modal-title')) return true;
  const title = document.getElementById('daily-bonus-title');
  if (title) {
    const shell = title.closest('.db-backdrop') || title.closest('[role="dialog"]') || title;
    if (isVisible(shell)) return true;
  }
  return Array.from(document.querySelectorAll('.db-backdrop')).some(isVisible);
}

/** True while a slot game play session is active (route or immersive play classes). */
export function isSlotGamePlaying(pathname = window.location.pathname) {
  if (pathname.startsWith('/play/')) return true;
  if (document.body.classList.contains('slot-game-play-active')) return true;
  if (document.body.classList.contains('slot-game-mode')) return true;
  return document.documentElement.classList.contains('slot-game-route');
}

/** True when any app modal, overlay, slot play, or blocking popup is open. */
export function isBlockingOverlayOpen(pathname = window.location.pathname) {
  if (isSlotGamePlaying(pathname)) return true;

  if (BODY_MODAL_LOCK_CLASSES.some((cls) => document.body.classList.contains(cls))) {
    return true;
  }

  return hasVisibleOverlay();
}

/**
 * True when the user is in a deposit/withdraw/payment/dialog flow that should
 * defer dashboard promotional modals. Excludes the promo modals themselves
 * (spin ready, first-deposit bonus, invite friends).
 */
export function isPromoDeferOverlayOpen(pathname = window.location.pathname) {
  if (isSlotGamePlaying(pathname)) return true;

  if (PROMO_DEFER_BODY_CLASSES.some((cls) => document.body.classList.contains(cls))) {
    return true;
  }

  if (Array.from(document.querySelectorAll(PROMO_DEFER_OVERLAY_SELECTORS)).some(isVisible)) {
    return true;
  }

  // Deposit-required and other non-promo fdb overlays share `.fdb-backdrop`.
  return Array.from(document.querySelectorAll('.fdb-backdrop')).some(
    (el) => isVisible(el) && !el.querySelector(DASHBOARD_PROMO_MODAL_TITLE_SELECTOR)
  );
}

/**
 * True when another dashboard promo should wait (busy overlays OR daily bonus already open).
 * Used by spin / first-deposit / invite chain so they never stack on Daily Bonus.
 */
export function isDashboardPromoBlocked(pathname = window.location.pathname) {
  return isPromoDeferOverlayOpen(pathname) || isDailyBonusModalOpen();
}


/** True while spin / first-deposit / invite promo modals are visible. */
export function isSpinDepositInvitePromoOpen() {
  return Boolean(
    document.getElementById('swr-modal-title') ||
      document.getElementById('fdb-modal-title') ||
      document.getElementById('rfx-modal-title')
  );
}

export { PROMO_DEFER_RETRY_MS, PROMO_AFTER_BUSY_DELAY_MS };

/** Subscribes to route / class / portal changes and reports blocking overlay state. */
export function useBlockingOverlayOpen() {
  const { pathname } = useLocation();
  const [blocked, setBlocked] = useState(() => isBlockingOverlayOpen(pathname));

  useEffect(() => {
    let rafId = 0;
    let intervalId = 0;
    let cancelled = false;

    const update = () => {
      if (cancelled) return;
      setBlocked(isBlockingOverlayOpen(pathname));
    };

    const scheduleUpdate = () => {
      if (rafId || cancelled) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        update();
      });
    };

    const classObserver = new MutationObserver(scheduleUpdate);
    classObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const portalObserver = new MutationObserver(scheduleUpdate);
    portalObserver.observe(document.body, {
      childList: true,
      subtree: false,
    });

    intervalId = window.setInterval(scheduleUpdate, OVERLAY_POLL_MS);
    update();

    return () => {
      cancelled = true;
      classObserver.disconnect();
      portalObserver.disconnect();
      window.clearInterval(intervalId);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [pathname]);

  return blocked;
}
