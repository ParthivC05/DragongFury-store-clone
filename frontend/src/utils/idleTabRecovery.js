/**
 * Recover from blank/frozen tabs after background time.
 *
 * Chrome/Safari suspend background tabs: sockets die, canvas/GPU layers freeze,
 * and a leftover full-screen loader can eat every tap. Users then have to close
 * the tab. On return: unstick overlays immediately; reload after a long away
 * time, bfcache restore, or a browser freeze/resume cycle.
 *
 * Uses wall-clock timestamps (not timers) because background timers are throttled.
 */

const IDLE_RELOAD_MS = 90 * 1000;
const BLANK_CHECK_IDLE_MS = 20 * 1000;
const HIDDEN_AT_KEY = 'pj:tab-hidden-at';
const RELOAD_GUARD_KEY = 'pj:idle-tab-reload';
const GUARD_CLEAR_MS = 15000;

function readHiddenAt(fallback) {
  try {
    const raw = sessionStorage.getItem(HIDDEN_AT_KEY);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeHiddenAt(ts) {
  try {
    sessionStorage.setItem(HIDDEN_AT_KEY, String(ts));
  } catch {
    /* private mode */
  }
}

function clearReloadGuard() {
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    /* ignore */
  }
}

function shouldSkipReload() {
  const body = document.body;
  if (!body) return false;
  return (
    body.classList.contains('payment-iframe-active') ||
    body.classList.contains('slot-game-play-active') ||
    body.classList.contains('slot-game-mode')
  );
}

function reloadOnce() {
  if (shouldSkipReload()) {
    unstickUi();
    return;
  }
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') return;
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    /* still attempt reload */
  }
  window.location.reload();
}

function isRootBlank() {
  const root = document.getElementById('root');
  if (!root) return true;
  if (root.childElementCount === 0) return true;
  const rect = root.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return true;

  const dash = document.querySelector('.dash-root');
  if (!dash) return false;
  const style = window.getComputedStyle(dash);
  if (style.visibility === 'hidden' || style.opacity === '0' || style.display === 'none') {
    const loader = document.querySelector('.dash-loader-screen');
    if (!loader) return true;
    const loaderRect = loader.getBoundingClientRect();
    return loaderRect.width === 0 || loaderRect.height === 0;
  }
  return false;
}

function hasStuckPageLoader() {
  const body = document.body;
  if (!body?.classList.contains('page-loader-active')) return false;
  const loader = document.querySelector('.dash-loader-screen');
  return Boolean(loader);
}

/**
 * Drop leftover overlay / scroll-lock so taps work even if React is wedged.
 * Never detach React portal nodes — removing `.dash-loader-screen` while React
 * still owns it throws NotFoundError removeChild and blanks /casino and /deposit.
 */
function unstickUi() {
  try {
    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return;

    body.classList.remove('page-loader-active');
    document.querySelectorAll('.dash-loader-screen').forEach((el) => {
      el.setAttribute('hidden', '');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });

    const openDialog = document.querySelector(
      '[role="dialog"][aria-modal="true"], [data-radix-dialog-overlay][data-state="open"]'
    );
    if (!openDialog) {
      body.classList.remove('app-modal-open');
      body.style.overflow = '';
      html.style.overflow = '';
      if (body.style.position === 'fixed') {
        const top = body.style.top;
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        const y = Math.abs(Number.parseInt(top, 10) || 0);
        window.scrollTo(0, y);
      }
    }

    void html.offsetHeight;
    html.classList.add('ui-force-repaint');
    window.setTimeout(() => {
      html.classList.remove('ui-force-repaint');
    }, 50);
  } catch {
    /* ignore */
  }
}

/**
 * Start listening for tab hide/show, Safari bfcache, and Chrome freeze/resume.
 * Safe to call once at boot from main.jsx (vanilla — works even if React is frozen).
 */
export function startIdleTabRecovery() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let hiddenAt = Date.now();
  let sawBackground = document.visibilityState === 'hidden';

  window.setTimeout(clearReloadGuard, GUARD_CLEAR_MS);

  const markHidden = () => {
    sawBackground = true;
    hiddenAt = Date.now();
    writeHiddenAt(hiddenAt);
  };

  const recoverIfNeeded = ({ forceReload = false } = {}) => {
    if (document.visibilityState !== 'visible') return;

    // First pageshow of a fresh document: the casino/deposit full-screen
    // loader is a React portal. Yanking it here blanks the page.
    if (!sawBackground && !forceReload && !document.wasDiscarded) {
      return;
    }

    unstickUi();

    try {
      window.dispatchEvent(new CustomEvent('pj:tab-resume', { detail: { awayMs: Date.now() - readHiddenAt(hiddenAt) } }));
    } catch {
      /* ignore */
    }

    if (forceReload) {
      reloadOnce();
      return;
    }

    const awayMs = Date.now() - readHiddenAt(hiddenAt);

    if (awayMs >= IDLE_RELOAD_MS) {
      reloadOnce();
      return;
    }

    if (awayMs < BLANK_CHECK_IDLE_MS) return;

    window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (isRootBlank() || hasStuckPageLoader()) reloadOnce();
    }, 400);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      markHidden();
      return;
    }
    recoverIfNeeded();
  };

  const onPageShow = (event) => {
    if (event.persisted) {
      recoverIfNeeded({ forceReload: true });
      return;
    }
    if (document.visibilityState === 'visible') {
      recoverIfNeeded();
    }
  };

  const onResume = () => {
    recoverIfNeeded({ forceReload: true });
  };

  if (document.visibilityState === 'hidden') {
    markHidden();
  }

  if (document.wasDiscarded) {
    window.setTimeout(() => reloadOnce(), 0);
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('resume', onResume);
  document.addEventListener('freeze', markHidden);
}
