/**
 * Browser URL as it exists after history.pushState — not deferred by
 * React startTransition. Needed so /deposit and /casino can show a loader
 * while the previous page (home) is still painted.
 */

export function isDepositPath(pathname) {
  return pathname === '/deposit' || String(pathname || '').startsWith('/deposit/');
}

export function isCasinoPath(pathname) {
  return pathname === '/casino' || String(pathname || '').startsWith('/casino/');
}

export function isLoaderGatedPath(pathname) {
  return isDepositPath(pathname) || isCasinoPath(pathname);
}

function readRouteKey() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getStore() {
  if (typeof window === 'undefined') {
    return { listeners: new Set(), currentKey: '/' };
  }
  if (!window.__pjBrowserLocationStore) {
    const store = {
      listeners: new Set(),
      currentKey: readRouteKey()
    };
    const notify = () => {
      const next = readRouteKey();
      if (next === store.currentKey) return;
      store.currentKey = next;
      store.listeners.forEach((cb) => cb());
    };
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function pushStatePatched(...args) {
      const ret = origPush.apply(this, args);
      notify();
      return ret;
    };
    window.history.replaceState = function replaceStatePatched(...args) {
      const ret = origReplace.apply(this, args);
      notify();
      return ret;
    };
    window.addEventListener('popstate', notify);
    window.__pjBrowserLocationStore = store;
  }
  return window.__pjBrowserLocationStore;
}

export function getBrowserRouteKey() {
  const store = getStore();
  store.currentKey = readRouteKey();
  return store.currentKey;
}

export function subscribeBrowserLocation(callback) {
  const store = getStore();
  store.listeners.add(callback);
  return () => store.listeners.delete(callback);
}

export function getBrowserPathname(routeKey = getBrowserRouteKey()) {
  return String(routeKey || '/').split('?')[0].split('#')[0] || '/';
}
