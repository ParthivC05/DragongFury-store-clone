/**
 * Tracks backend reachability so the app can show a maintenance screen
 * when the shared API is down (instead of broken pages / endless errors).
 *
 * Important: transient request failures / refresh aborts must NOT flash the
 * "Be right back" UI. Only the dedicated /api/status probe can turn it on.
 */

const STATUS_PATH = '/api/status';
const PROBE_INTERVAL_MS = 20000;
const PROBE_FAILURE_THRESHOLD = 2;
const RECOVERY_THRESHOLD = 2;
/** Ignore soft failures right after load (refresh / burst of parallel calls). */
const LOAD_GRACE_MS = 5000;

const loadedAt = Date.now();
let probeFailureCount = 0;
let successCount = 0;
let maintenance = false;
let probeTimer = null;
const listeners = new Set();

function apiStatusUrl() {
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (!import.meta.env.DEV) {
    return `${configured}${STATUS_PATH}`;
  }
  if (!configured) return STATUS_PATH;
  try {
    const u = new URL(configured, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const isLocal =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (isLocal) return STATUS_PATH;
  } catch {
    /* keep */
  }
  return `${configured}${STATUS_PATH}`;
}

function inLoadGrace() {
  return Date.now() - loadedAt < LOAD_GRACE_MS;
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(maintenance);
    } catch {
      /* ignore */
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent('backend:maintenance', { detail: { maintenance } })
    );
  } catch {
    /* ignore */
  }
}

function setMaintenance(next) {
  if (maintenance === next) return;
  maintenance = next;
  notify();
}

export function isBackendInMaintenance() {
  return maintenance;
}

export function subscribeBackendMaintenance(listener) {
  listeners.add(listener);
  listener(maintenance);
  return () => listeners.delete(listener);
}

/** Call when any API request succeeds. */
export function reportBackendReachable() {
  probeFailureCount = 0;
  successCount += 1;
  if (maintenance && successCount >= RECOVERY_THRESHOLD) {
    setMaintenance(false);
  }
}

/**
 * Soft signal from normal API calls. Never opens the maintenance screen —
 * refreshes and parallel request races were false-triggering "Be right back".
 */
export function reportBackendUnreachable() {
  if (inLoadGrace()) return;
  successCount = 0;
}

export async function probeBackendHealth() {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const res = await fetch(apiStatusUrl(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal
    });
    window.clearTimeout(timeout);
    if (res.ok || res.status < 500) {
      reportBackendReachable();
      return true;
    }
    successCount = 0;
    probeFailureCount += 1;
    if (!maintenance && !inLoadGrace() && probeFailureCount >= PROBE_FAILURE_THRESHOLD) {
      setMaintenance(true);
    }
    return false;
  } catch {
    // Probe timeout / network error — real downtime signal.
    if (inLoadGrace()) return false;
    successCount = 0;
    probeFailureCount += 1;
    if (!maintenance && probeFailureCount >= PROBE_FAILURE_THRESHOLD) {
      setMaintenance(true);
    }
    return false;
  }
}

export function startBackendHealthMonitor() {
  if (probeTimer != null) return;
  // Delay first probe past load grace so refresh bursts don't race it.
  window.setTimeout(() => {
    probeBackendHealth();
    if (probeTimer == null) {
      probeTimer = window.setInterval(probeBackendHealth, PROBE_INTERVAL_MS);
    }
  }, LOAD_GRACE_MS);
}

export function stopBackendHealthMonitor() {
  if (probeTimer == null) return;
  window.clearInterval(probeTimer);
  probeTimer = null;
}
