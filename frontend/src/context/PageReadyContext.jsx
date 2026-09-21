import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { AppLoader } from '../components/AppLoader';
import { waitForContentPaint } from '../utils/waitForContentPaint';
import {
  getBrowserPathname,
  getBrowserRouteKey,
  isCasinoPath,
  isLoaderGatedPath,
  subscribeBrowserLocation,
} from '../utils/browserLocation';

const PageReadyContext = createContext(null);

export function PageReadyProvider({ children }) {
  const location = useLocation();
  const reactRouteKey = `${location.pathname}${location.search}${location.hash}`;
  const browserRouteKey = useSyncExternalStore(
    subscribeBrowserLocation,
    getBrowserRouteKey,
    () => reactRouteKey
  );
  const browserPath = getBrowserPathname(browserRouteKey);
  const isLoaderGatedRoute =
    isLoaderGatedPath(browserPath) || isLoaderGatedPath(location.pathname);
  const routeKey = isLoaderGatedPath(browserPath) ? browserRouteKey : reactRouteKey;
  const loaderMessage = isCasinoPath(browserPath) || isCasinoPath(location.pathname)
    ? 'Loading casino'
    : 'Loading deposit';
  const routeKeyRef = useRef(routeKey);
  routeKeyRef.current = routeKey;

  const [readyRouteKey, setReadyRouteKey] = useState('');

  const markPageReady = useCallback((forRouteKey) => {
    const expected = forRouteKey ?? routeKeyRef.current;
    if (expected !== routeKeyRef.current) return;
    setReadyRouteKey(expected);
  }, []);

  const prevGatedRouteKeyRef = useRef('');
  useLayoutEffect(() => {
    if (!isLoaderGatedRoute) {
      prevGatedRouteKeyRef.current = '';
      return undefined;
    }
    if (prevGatedRouteKeyRef.current !== routeKey) {
      prevGatedRouteKeyRef.current = routeKey;
      setReadyRouteKey('');
    }
    return undefined;
  }, [routeKey, isLoaderGatedRoute]);

  const showLoader = isLoaderGatedRoute && readyRouteKey !== routeKey;

  useEffect(() => {
    if (!isLoaderGatedRoute) return undefined;
    let cancelled = false;
    import('../utils/depositPackageImage').then((m) => {
      if (!cancelled) m.preloadDepositPackageImages();
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaderGatedRoute]);

  useEffect(() => {
    if (!showLoader) return undefined;
    const timer = window.setTimeout(() => {
      markPageReady(routeKeyRef.current);
    }, 8000);

    const dropLoaderIfHidden = () => {
      if (document.visibilityState === 'hidden') {
        markPageReady(routeKeyRef.current);
      }
    };
    document.addEventListener('visibilitychange', dropLoaderIfHidden);
    window.addEventListener('pagehide', dropLoaderIfHidden);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', dropLoaderIfHidden);
      window.removeEventListener('pagehide', dropLoaderIfHidden);
    };
  }, [showLoader, markPageReady]);

  useEffect(() => {
    if (showLoader) {
      document.body.classList.add('page-loader-active');
    } else {
      document.body.classList.remove('page-loader-active');
    }
    return () => document.body.classList.remove('page-loader-active');
  }, [showLoader]);

  const value = useMemo(
    () => ({
      markPageReady,
      showLoader,
      readyRouteKey,
    }),
    [markPageReady, showLoader, readyRouteKey]
  );

  return (
    <PageReadyContext.Provider value={value}>
      {children}
      {showLoader ? <AppLoader fullScreen message={loaderMessage} /> : null}
    </PageReadyContext.Provider>
  );
}

export function usePageReady() {
  const ctx = useContext(PageReadyContext);
  if (!ctx) {
    throw new Error('usePageReady must be used within PageReadyProvider');
  }
  return ctx;
}

/**
 * Call from route pages when async data + DOM are ready.
 * Defaults to immediate reveal (no font/image gate) for fast SPA transitions.
 * @param {boolean} isReady - false while page data is still loading
 * @param {{ immediate?: boolean }} [options] - set immediate:false to wait for paint helpers
 */
export function usePageContentReady(isReady = true, options = {}) {
  const { immediate = true } = options;
  const { markPageReady } = usePageReady();
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (!isReady) return undefined;

    let cancelled = false;

    const reveal = () => {
      if (!cancelled) markPageReady(routeKey);
    };

    if (immediate) {
      reveal();
      return () => {
        cancelled = true;
      };
    }

    waitForContentPaint().then(reveal);

    return () => {
      cancelled = true;
    };
  }, [immediate, isReady, markPageReady, routeKey]);
}
