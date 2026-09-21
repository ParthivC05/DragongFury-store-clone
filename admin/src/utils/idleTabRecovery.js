/**
 * Recover from blank/frozen tabs after long background time.
 *
 * Chrome/Safari suspend background tabs: sockets die, WebGL/canvas can go black,
 * and the React tree can freeze. Users then see a blank screen until a manual refresh.
 *
 * On return to the tab: if idle was long enough (or #root is empty), reload once.
 * Uses wall-clock timestamps (not timers) because background timers are throttled.
 */

const IDLE_RELOAD_MS = 5 * 60 * 1000;
/** After this away-time, also reload if #root looks empty. */
const BLANK_CHECK_IDLE_MS = 2 * 60 * 1000;
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

function reloadOnce() {
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
  return rect.width === 0 || rect.height === 0;
}

/**
 * Start listening for tab hide/show and Safari bfcache restores.
 * Safe to call once at boot from main.jsx (vanilla — works even if React is frozen).
 */
export function startIdleTabRecovery() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let hiddenAt = Date.now();

  window.setTimeout(clearReloadGuard, GUARD_CLEAR_MS);

  const markHidden = () => {
    hiddenAt = Date.now();
    writeHiddenAt(hiddenAt);
  };

  const recoverIfNeeded = () => {
    if (document.visibilityState !== 'visible') return;

    const awayMs = Date.now() - readHiddenAt(hiddenAt);

    if (awayMs >= IDLE_RELOAD_MS) {
      reloadOnce();
      return;
    }

    if (awayMs < BLANK_CHECK_IDLE_MS) return;

    // Give React a beat to paint; if still empty, the tab is likely dead.
    window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (isRootBlank()) reloadOnce();
    }, 500);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      markHidden();
      return;
    }
    recoverIfNeeded();
  };

  const onPageShow = (event) => {
    // Safari/iOS can restore from bfcache with a frozen UI.
    if (event.persisted) recoverIfNeeded();
  };

  if (document.visibilityState === 'hidden') {
    markHidden();
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
}
