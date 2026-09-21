import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { usePinAppChromeToVisualViewport } from '../hooks/usePinAppChromeToVisualViewport';
import { Navbar } from './Navbar';
import { BottomBar } from './BottomBar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
/* Above-fold shell. Full theme is scheduled after first paint on `/`. */
import '../styles/dashboard-critical.css';
import { loadDashboardStyles, scheduleDashboardStyles } from '../styles/loadDashboardStyles';
import { warmupDeposit } from '../utils/preloadDeposit';
import { getBrowserPathname, getBrowserRouteKey, subscribeBrowserLocation } from '../utils/browserLocation';

const DashboardBackground = lazy(() =>
  import('./Dashboard/DashboardBackground').then((m) => ({ default: m.DashboardBackground }))
);
const LayoutAuthOverlays = lazy(() =>
  import('./LayoutAuthOverlays').then((m) => ({ default: m.LayoutAuthOverlays }))
);
const BackgroundMusic = lazy(() =>
  import('./BackgroundMusic').then((m) => ({ default: m.BackgroundMusic }))
);
const LandingFooter = lazy(() =>
  import('./LandingFooter').then((m) => ({ default: m.LandingFooter }))
);
const LandingSocialLinks = lazy(() =>
  import('./LandingSocialLinks').then((m) => ({ default: m.LandingSocialLinks }))
);

const AUTH_PATHS = ['/login', '/register', '/check-email', '/forgot-password', '/reset-password'];

export function Layout({ children }) {
  usePinAppChromeToVisualViewport();
  const { pathname } = useLocation();
  const browserRouteKey = useSyncExternalStore(
    subscribeBrowserLocation,
    getBrowserRouteKey,
    () => pathname
  );
  const browserPath = getBrowserPathname(browserRouteKey);
  const depositPending =
    (browserPath === '/deposit' || browserPath.startsWith('/deposit/')) &&
    pathname !== '/deposit' &&
    !pathname.startsWith('/deposit/');
  const layoutPath = depositPending ? browserPath : pathname;
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onPointerOver = (e) => {
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      try {
        const url = new URL(a.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === '/deposit' || url.pathname.startsWith('/deposit/')) {
          warmupDeposit();
        }
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('pointerover', onPointerOver, true);

    const useIdle = typeof window.requestIdleCallback === 'function';
    const idleId = useIdle
      ? window.requestIdleCallback(() => warmupDeposit(), { timeout: 1800 })
      : window.setTimeout(() => warmupDeposit(), 400);

    return () => {
      document.removeEventListener('pointerover', onPointerOver, true);
      if (useIdle && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const onCasino = pathname === '/casino' || pathname.startsWith('/casino/');
    const onHome = pathname === '/';
    if (!onCasino && !onHome) return undefined;

    let cancelled = false;
    const run = () => {
      import('./Home/DashboardSlotGamesSection').then((mod) => {
        if (!cancelled) mod.prefetchLobbySlotGames();
      });
    };

    if (onCasino) {
      run();
      return () => {
        cancelled = true;
      };
    }

    const idleId =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(run, { timeout: 2500 })
        : window.setTimeout(run, 800);
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [pathname]);

  const isAuthPage = AUTH_PATHS.includes(layoutPath);
  const isDragonFuryAuth =
    layoutPath === '/login' ||
    layoutPath === '/register' ||
    layoutPath === '/check-email' ||
    layoutPath === '/forgot-password';
  const isDashboardLayout =
    layoutPath === '/' ||
    layoutPath === '/link2play' ||
    layoutPath === '/casino' ||
    layoutPath.startsWith('/casino/') ||
    layoutPath === '/platform' ||
    layoutPath === '/bonus';
  const isGuestLanding =
    (layoutPath === '/' ||
      layoutPath === '/link2play' ||
      layoutPath === '/casino' ||
      layoutPath.startsWith('/casino/') ||
      layoutPath === '/platform' ||
      layoutPath === '/bonus') &&
    !authLoading &&
    !isAuthenticated;
  const hideGuestBuyWithdraw = !authLoading && !isAuthenticated;
  const isBottomNavOnly =
    layoutPath === '/deposit' ||
    layoutPath === '/withdraw' ||
    layoutPath.startsWith('/support/tickets');
  const isSupportChat = layoutPath.startsWith('/support/tickets');
  const useNavOnlyBottomPad = isBottomNavOnly || hideGuestBuyWithdraw;

  useEffect(() => {
    const handleUnauthorized = () => {
      toast?.info('You have been signed out. Please sign in again.');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [toast]);

  useEffect(() => {
    if (pathname !== '/') {
      document.documentElement.classList.add('pj-lcp-takenover');
    }
    return undefined;
  }, [pathname]);

  useEffect(() => {
    if (pathname === '/') {
      scheduleDashboardStyles();
      return undefined;
    }
    loadDashboardStyles();
    return undefined;
  }, [pathname, isAuthenticated]);

  useEffect(() => {
    if (!isGuestLanding) {
      document.body.classList.remove('guest-landing-active');
      return undefined;
    }
    document.body.classList.add('guest-landing-active');
    return () => document.body.classList.remove('guest-landing-active');
  }, [isGuestLanding]);

  useEffect(() => {
    if (!hideGuestBuyWithdraw) {
      document.body.classList.remove('guest-hide-buy-withdraw');
      return undefined;
    }
    document.body.classList.add('guest-hide-buy-withdraw');
    return () => document.body.classList.remove('guest-hide-buy-withdraw');
  }, [hideGuestBuyWithdraw]);

  if (isDragonFuryAuth) {
    return <>{children}</>;
  }

  return (
    <div
      className={`dash-root flex flex-col min-h-screen${isGuestLanding ? ' dash-root--guest-landing' : ''}${
        useNavOnlyBottomPad ? ' dash-root--bottom-nav-only' : ''
      }${isDashboardLayout ? ' dash-root--split-scroll' : ''}${
        isSupportChat ? ' dash-root--support-chat' : ''
      }`}
    >
      <Suspense fallback={null}>
        <DashboardBackground />
      </Suspense>
      <Navbar />
      <main
        className={
          isAuthPage
            ? 'flex flex-col flex-1 w-full min-h-[calc(100dvh-var(--dash-nav-h))]'
            : isDashboardLayout
              ? `dash-shell-main flex flex-col flex-1 min-w-0 w-full px-1 ${
                  isGuestLanding ? 'pt-0 pb-0 md:pb-8' : 'py-4 md:py-6 pb-28 md:pb-8'
                }`
              : `flex flex-col flex-1 min-w-0 w-full ${
                  isSupportChat
                    ? 'py-3 md:py-6 px-2 sm:px-5 md:px-8 lg:px-10 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-8'
                    : `py-4 md:py-6 px-3 sm:px-5 md:px-8 lg:px-10 ${
                        useNavOnlyBottomPad ? 'pb-20 md:pb-8' : 'pb-28 md:pb-8'
                      }`
                }`
        }
      >
        {isAuthPage ? (
          children
        ) : (
          <div
            className={`dash-shell-inner flex flex-col flex-1 w-full min-w-0 mx-auto ${
              isDashboardLayout || isSupportChat ? 'max-w-none' : 'max-w-content'
            }`}
          >
            {children}
          </div>
        )}
      </main>
      {!isAuthPage && (
        <>
          {!isDashboardLayout && !isSupportChat ? (
            <Suspense fallback={null}>
              <LandingFooter />
            </Suspense>
          ) : null}
          <BottomBar />
        </>
      )}
      {isAuthenticated && (
        <Suspense fallback={null}>
          <LayoutAuthOverlays isAuthPage={isAuthPage} />
        </Suspense>
      )}
      {!isAuthenticated && !isAuthPage && (
        <Suspense fallback={null}>
          <BackgroundMusic hideControls={false} />
        </Suspense>
      )}
      {layoutPath === '/' && (
        <Suspense fallback={null}>
          <LandingSocialLinks variant="dock" />
        </Suspense>
      )}
    </div>
  );
}
