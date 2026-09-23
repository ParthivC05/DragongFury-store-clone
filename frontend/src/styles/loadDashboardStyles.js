/**
 * Full dashboard theme. Start right after the current task so games / pay UI
 * are not stuck blank until banner images fire window `load`.
 */
let dashboardStylesPromise = null;

export const GUEST_STYLE_PATHS = ['/', '/link2play', '/casino', '/platform', '/bonus'];

export function loadDashboardStyles() {
  if (!dashboardStylesPromise) {
    dashboardStylesPromise = import('./dashboard-dragonfury.css')
      .then(() => import('./dashboard-redesign.css'))
      .then(() => import('./dashboard-fury-layout.css'))
      .then(() => import('./dashboard-df-online.css'))
      .then(() => import('../components/Auth/auth-df-modal.css'))
      .catch(() => {
        /* Still resolve so UI never waits forever if a CSS chunk fails. */
      });
  }
  return dashboardStylesPromise;
}

export function shouldDeferDashboardStyles() {
  return true;
}

export function scheduleDashboardStyles() {
  if (typeof window === 'undefined') return loadDashboardStyles();
  if (document.readyState === 'complete') return loadDashboardStyles();
  const start = () => loadDashboardStyles();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 300 });
  } else {
    window.setTimeout(start, 0);
  }
  return dashboardStylesPromise;
}
