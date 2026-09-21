import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CoinProvider } from './context/CoinContext';
import { CoinLaunchProvider } from './context/CoinLaunchContext';
import { ToastProvider } from './context/ToastContext';
import { SpinWheelStatusProvider } from './context/SpinWheelStatusContext';
import { VipStatusProvider } from './context/VipStatusContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ScrollToTop } from './components/ScrollToTop';
import { Toaster } from './components/Toaster';
import { DeviceBlockModalHost } from './components/Auth/DeviceBlockModalHost';
import { PushPermissionHost } from './components/PushPermissionPrompt';
import { PageReadyProvider } from './context/PageReadyContext';
import { AppLoader } from './components/AppLoader';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import { GeoWrapper } from './components/GeoWrapper';
import {
  startBackendHealthMonitor,
  stopBackendHealthMonitor,
  subscribeBackendMaintenance
} from './utils/backendHealth';
import { Home } from './pages/Home';
import { GuestRoute } from './components/GuestRoute';
import { site } from './config/site';
import { applyRouteSchema, SITE_ORIGIN } from './utils/schemaOrg';
import { applyDefaultPageSeo, applyRobotsMeta } from './utils/pageSeo';
import { getRouteSeo, isGameCategorySlug, getGameCategoryRedirect, getGameCategoryCanonicalPath } from './config/seoPages';
import { WIN568_GAMES_SLUG, isWin568HiddenPath } from './config/win568';
import { SCORPIO_GAMES_SLUG, isScorpioHiddenPath } from './config/scorpio';
import { OPEN_INTERCOM_EVENT, OPEN_SUPPORT_WIDGET_EVENT } from './components/intercomApi';

const AuthView = lazy(() =>
  import('./components/AuthView').then((m) => ({ default: m.AuthView }))
);
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings }))
);
const VerifyEmail = lazy(() =>
  import('./pages/VerifyEmail').then((m) => ({ default: m.VerifyEmail }))
);
const CheckEmail = lazy(() =>
  import('./pages/CheckEmail').then((m) => ({ default: m.CheckEmail }))
);
const ResetPassword = lazy(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const ForgotPassword = lazy(() =>
  import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword }))
);
const Terms = lazy(() =>
  import('./pages/Terms').then((m) => ({ default: m.Terms }))
);
const Privacy = lazy(() =>
  import('./pages/Privacy').then((m) => ({ default: m.Privacy }))
);
const GameDetail = lazy(() =>
  import('./pages/Games').then((m) => ({ default: m.GameDetail }))
);
const GamesListing = lazy(() =>
  import('./pages/Games/GamesListing').then((m) => ({ default: m.GamesListing }))
);
const SeoGameCategory = lazy(() =>
  import('./pages/Games/SeoGameCategory').then((m) => ({ default: m.SeoGameCategory }))
);
const FaqPage = lazy(() =>
  import('./pages/Faq').then((m) => ({ default: m.FaqPage }))
);
const ContactPage = lazy(() =>
  import('./pages/Contact').then((m) => ({ default: m.ContactPage }))
);
const Deposit = lazy(() =>
  import('./pages/Deposit').then((m) => ({ default: m.Deposit }))
);
const DepositReturn = lazy(() =>
  import('./pages/Deposit').then((m) => ({ default: m.DepositReturn }))
);
const Withdraw = lazy(() =>
  import('./pages/Withdraw').then((m) => ({ default: m.Withdraw }))
);
const KycCallback = lazy(() =>
  import('./pages/KycCallback').then((m) => ({ default: m.KycCallback }))
);
const Promotions = lazy(() =>
  import('./pages/Promotions').then((m) => ({ default: m.Promotions }))
);
const SpinWheel = lazy(() =>
  import('./pages/SpinWheel').then((m) => ({ default: m.SpinWheel }))
);
const DailyBonus = lazy(() =>
  import('./pages/DailyBonus').then((m) => ({ default: m.DailyBonus }))
);
const ClaimOffer = lazy(() =>
  import('./pages/ClaimOffer').then((m) => ({ default: m.ClaimOffer }))
);
const Bonus = lazy(() =>
  import('./pages/Bonus').then((m) => ({ default: m.Bonus }))
);
const AccountProfile = lazy(() =>
  import('./pages/Account').then((m) => ({ default: m.AccountProfile }))
);
const AccountVip = lazy(() =>
  import('./pages/Account').then((m) => ({ default: m.AccountVip }))
);
const AccountTransactions = lazy(() =>
  import('./pages/Account').then((m) => ({ default: m.AccountTransactions }))
);
const AccountAffiliate = lazy(() =>
  import('./pages/Account').then((m) => ({ default: m.AccountAffiliate }))
);
const Help = lazy(() =>
  import('./pages/Help').then((m) => ({ default: m.Help }))
);
const SupportTicketsPage = lazy(() =>
  import('./pages/SupportTickets').then((m) => ({ default: m.SupportTicketsPage }))
);
const SupportTicketDetailPage = lazy(() =>
  import('./pages/SupportTickets').then((m) => ({ default: m.SupportTicketDetailPage }))
);
const Blog = lazy(() =>
  import('./pages/Blog').then((m) => ({ default: m.Blog }))
);
const BlogDetail = lazy(() =>
  import('./pages/Blog/BlogDetail').then((m) => ({ default: m.BlogDetail }))
);
const FooterPage = lazy(() =>
  import('./pages/FooterPage').then((m) => ({ default: m.FooterPage }))
);
const Link2Play = lazy(() =>
  import('./pages/Link2Play').then((m) => ({ default: m.Link2Play }))
);
const Install = lazy(() =>
  import('./pages/Install').then((m) => ({ default: m.Install }))
);
const AllSlotGames = lazy(() =>
  import('./pages/SlotGames/AllSlotGames').then((m) => ({ default: m.AllSlotGames }))
);
const PlatformGames = lazy(() =>
  import('./pages/Platform').then((m) => ({ default: m.PlatformGames }))
);
const SlotGamePlayPage = lazy(() =>
  import('./pages/SlotGames/SlotGamePlayPage').then((m) => ({ default: m.SlotGamePlayPage }))
);
const Win568Games = lazy(() =>
  import('./pages/Win568Games').then((m) => ({ default: m.Win568Games }))
);
const ScorpioGames = lazy(() =>
  import('./pages/ScorpioGames').then((m) => ({ default: m.ScorpioGames }))
);
const GoogleAuthCallback = lazy(() =>
  import('./pages/GoogleAuthCallback').then((m) => ({ default: m.GoogleAuthCallback }))
);
const IntercomWidget = lazy(() =>
  import('./components/IntercomWidget').then((m) => ({ default: m.IntercomWidget }))
);
const LiveWinPopup = lazy(() =>
  import('./components/Home/LiveWinPopup').then((m) => ({ default: m.LiveWinPopup }))
);
const AuthLiveWinnersBar = lazy(() =>
  import('./components/Home/AuthLiveWinnersBar').then((m) => ({ default: m.AuthLiveWinnersBar }))
);

function RouteFallback() {
  return <AppLoader fillPage message="Loading page" />;
}

/** Avoid downloading the live-win chunk until a signed-in session exists. */
function AuthenticatedLiveWinPopup() {
  const { isAuthenticated, loading } = useAuth();
  if (loading || !isAuthenticated) return null;
  return (
    <Suspense fallback={null}>
      <LiveWinPopup />
    </Suspense>
  );
}

function AuthenticatedLiveWinnersBar() {
  const { isAuthenticated, loading } = useAuth();
  const { pathname } = useLocation();
  const onHomeOrCasino =
    pathname === '/' ||
    pathname === '/casino' ||
    pathname.startsWith('/casino/');
  if (loading || !isAuthenticated || !onHomeOrCasino) return null;
  return (
    <Suspense fallback={null}>
      <AuthLiveWinnersBar />
    </Suspense>
  );
}

/** Chat after first tap, 8s, or an explicit support/chat open so Contact/FAQ buttons work. */
function DeferredIntercom() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener('pointerdown', on, { once: true, passive: true });
    window.addEventListener('keydown', on, { once: true });
    window.addEventListener(OPEN_SUPPORT_WIDGET_EVENT, on);
    window.addEventListener(OPEN_INTERCOM_EVENT, on);
    const t = window.setTimeout(on, 8000);
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
      window.removeEventListener(OPEN_SUPPORT_WIDGET_EVENT, on);
      window.removeEventListener(OPEN_INTERCOM_EVENT, on);
      window.clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <IntercomWidget />
    </Suspense>
  );
}

/** Legacy /pages/:slug → /:slug */
function FooterPagesRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/${slug || ''}`} replace />;
}

/** Legacy /slots/:categoryId → /casino/:categoryId */
function LegacySlotsCategoryRedirect() {
  const { categoryId } = useParams();
  return <Navigate to={`/casino/${encodeURIComponent(categoryId || '')}`} replace />;
}

function GameDetailOrSeo() {
  const { gameId } = useParams();
  const redirectTo = getGameCategoryRedirect(gameId);
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  if (isGameCategorySlug(gameId)) return <SeoGameCategory />;
  return <GameDetail />;
}

function HomeOrLanding() {
  // The dashboard (sidebar + slideshow + games) is shown publicly on the
  // landing page. Guest interactions are routed to signup from within
  // the dashboard components themselves.
  return <Home />;
}

function RouteTitleManager() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const pathnameNorm = pathname || '/';
    const gameSlug = pathnameNorm.startsWith('/games/')
      ? pathnameNorm.slice('/games/'.length).split('/')[0]
      : '';
    const canonicalPath =
      (gameSlug && getGameCategoryCanonicalPath(gameSlug)) || pathnameNorm;
    const canonicalHref =
      canonicalPath === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${canonicalPath}`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalHref);

    applyRouteSchema(pathname);

    const hideFromIndex = isWin568HiddenPath(pathname) || isScorpioHiddenPath(pathname, search);
    const isBlogPostPage = /^\/blog\/.+/.test(pathnameNorm);
    if (hideFromIndex) {
      applyRobotsMeta('noindex, nofollow');
    } else if (!isBlogPostPage) {
      applyRobotsMeta(null);
    }

    const routeSeo = getRouteSeo(pathname);
    if (routeSeo) {
      applyDefaultPageSeo({ title: routeSeo.title, description: routeSeo.description });
      return;
    }

    const seoTitle = site.seoTitle || site.platformName;
    const baseTitle = site.platformName;
    const routeTitleMap = new Map([
      ['/', null], // homepage uses full SEO title
      ['/login', 'Login'],
      ['/register', 'Register'],
      ['/verify-email', 'Verify Email'],
      ['/check-email', 'Check Email'],
      ['/forgot-password', 'Forgot Password'],
      ['/reset-password', 'Reset Password'],
      ['/terms', 'Terms & Conditions'],
      ['/privacy', 'Privacy Policy'],
      ['/help', 'Help Center'],
      ['/support/tickets', 'Support Tickets'],
      ['/blog', 'Blog'],
      ['/casino', 'Casino Games'],
      ['/platform', 'Platforms'],
      ['/link2play', 'Link2Play'],
      ['/install', 'How to Install'],
      ['/games', 'Games'],
      ['/deposit', 'Deposit'],
      ['/deposit/return', 'Deposit Status'],
      ['/withdraw', 'Withdraw'],
      ['/promotions', 'Promotions'],
      ['/spinwheel', 'Spin Wheel'],
      ['/daily-bonus', 'Daily Bonus'],
      ['/bonus', 'Bonus'],
      ['/account', 'Account'],
      ['/account/profile', 'Link Payment Account'],
      ['/account/vip', 'VIP'],
      ['/account/transactions', 'Transactions'],
      ['/account/affiliate', 'Refer & Earn'],
      ['/settings', 'Settings'],
      [`/${WIN568_GAMES_SLUG}`, 'Games'],
      [`/${SCORPIO_GAMES_SLUG}`, 'Games'],
    ]);

    if (pathname === '/') {
      applyDefaultPageSeo({ title: seoTitle });
      return;
    }

    let pageTitle = routeTitleMap.get(pathname);

    if (!pageTitle && pathname.startsWith('/casino/')) {
      pageTitle = 'Casino Games';
    }

    const isBlogDetail = pathname.startsWith('/blog/');
    const isCmsFooterPage =
      !pageTitle &&
      pathname.length > 1 &&
      !pathname.slice(1).includes('/') &&
      !routeTitleMap.has(pathname);

    if (isBlogDetail || isCmsFooterPage) {
      // BlogDetail / FooterPage apply admin-managed meta after the page loads.
      if (isBlogDetail) document.title = `Blog | ${baseTitle}`;
      return;
    }

    if (!pageTitle && pathname.startsWith('/support/tickets')) {
      pageTitle = 'Support Tickets';
    }

    if (!pageTitle && pathname.startsWith('/play/')) {
      pageTitle = 'Casino Game';
    }

    if (!pageTitle && pathname.startsWith('/games/')) {
      pageTitle = 'Game Details';
    }

    const nextTitle = pathname === '/'
      ? seoTitle
      : (pageTitle ? `${pageTitle} | ${baseTitle}` : seoTitle);
    applyDefaultPageSeo({ title: nextTitle });
  }, [pathname, search]);

  return null;
}

function BackendMaintenanceGate({ children }) {
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    startBackendHealthMonitor();
    const unsub = subscribeBackendMaintenance(setMaintenance);
    return () => {
      unsub();
      stopBackendHealthMonitor();
    };
  }, []);

  if (maintenance) return <MaintenanceScreen />;
  return children;
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GeoWrapper>
      <AuthProvider>
        <CoinProvider>
        <CoinLaunchProvider>
        <BackendMaintenanceGate>
        <ScrollToTop />
        <RouteTitleManager />
        <ToastProvider>
          <SpinWheelStatusProvider>
            <VipStatusProvider>
            <PageReadyProvider>
              <>
                <Suspense fallback={<RouteFallback />}>
                <Routes>
                <Route
                  path="/play/:gameId"
                  element={(
                    <ProtectedRoute>
                      <SlotGamePlayPage />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="/auth/google/callback"
                  element={<GoogleAuthCallback />}
                />
                <Route path="/cashapp" element={<Navigate to="/" replace />} />
                <Route
                  path="*"
                  element={(
                    <Layout>
                      <Suspense fallback={<RouteFallback />}>
                      <Routes>
                <Route path="/" element={<HomeOrLanding />} />
                <Route path="/login" element={<AuthView />} />
                <Route path="/signin" element={<Navigate to="/login" replace />} />
                <Route path="/register" element={<AuthView />} />
                <Route path="/signup" element={<Navigate to="/register" replace />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/check-email" element={<CheckEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/help" element={<Help />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/support/tickets" element={<ProtectedRoute><SupportTicketsPage /></ProtectedRoute>} />
                <Route path="/support/tickets/:id" element={<ProtectedRoute><SupportTicketDetailPage /></ProtectedRoute>} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogDetail />} />
                <Route path="/pages/:slug" element={<FooterPagesRedirect />} />
                <Route
                  path="/link2play"
                  element={
                    <GuestRoute>
                      <Link2Play />
                    </GuestRoute>
                  }
                />
                <Route path="/install" element={<Install />} />
                <Route path="/download" element={<Navigate to="/install" replace />} />

                {/* Games list + SEO category slugs; numeric ids still open GameDetail */}
                <Route path="/games" element={<GamesListing />} />
                <Route path="/games/:gameId" element={<GameDetailOrSeo />} />

                <Route path="/casino" element={<AllSlotGames />} />
                <Route path="/casino/:categoryId" element={<AllSlotGames />} />
                <Route path="/slots" element={<Navigate to="/casino" replace />} />
                <Route path="/slots/:categoryId" element={<LegacySlotsCategoryRedirect />} />
                <Route path="/platform" element={<PlatformGames />} />
                <Route path="/platforms" element={<Navigate to="/platform" replace />} />
                <Route path="/testbona" element={<Navigate to="/casino" replace />} />

                {/* Protected routes */}
                <Route path="/deposit" element={<ProtectedRoute><Deposit /></ProtectedRoute>} />
                <Route path="/deposit/return" element={<DepositReturn />} />
                <Route path="/withdraw" element={<ProtectedRoute><Withdraw /></ProtectedRoute>} />
                <Route path="/kyc/callback" element={<ProtectedRoute><KycCallback /></ProtectedRoute>} />
                <Route path="/promotions" element={<ProtectedRoute><Promotions /></ProtectedRoute>} />
                <Route path="/spinwheel" element={<ProtectedRoute><SpinWheel /></ProtectedRoute>} />
                <Route path="/daily-bonus" element={<ProtectedRoute><DailyBonus /></ProtectedRoute>} />
                <Route path="/claim-offer" element={<ClaimOffer />} />
                <Route path="/bonus" element={<Bonus />} />

                {/* Account: profile redirects to settings; rest placeholders */}
                <Route path="/account" element={<Navigate to="/settings" replace />} />
                <Route path="/account/profile" element={<ProtectedRoute><AccountProfile /></ProtectedRoute>} />
                <Route path="/account/vip" element={<ProtectedRoute><AccountVip /></ProtectedRoute>} />
                <Route path="/account/transactions" element={<ProtectedRoute><AccountTransactions /></ProtectedRoute>} />
                <Route path="/account/affiliate" element={<ProtectedRoute><AccountAffiliate /></ProtectedRoute>} />

                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route
                  path={`/${WIN568_GAMES_SLUG}`}
                  element={<ProtectedRoute><Win568Games /></ProtectedRoute>}
                />
                <Route
                  path={`/${SCORPIO_GAMES_SLUG}`}
                  element={<ProtectedRoute><ScorpioGames /></ProtectedRoute>}
                />

                {/* CMS footer pages at /{slug} — after all fixed routes */}
                <Route path="/:slug" element={<FooterPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                      </Suspense>
                    </Layout>
                  )}
                />
                </Routes>
                </Suspense>
                <Toaster />
                <DeviceBlockModalHost />
                <PushPermissionHost />
                <AuthenticatedLiveWinPopup />
                <AuthenticatedLiveWinnersBar />
                <DeferredIntercom />
              </>
            </PageReadyProvider>
            </VipStatusProvider>
          </SpinWheelStatusProvider>
        </ToastProvider>
        </BackendMaintenanceGate>
        </CoinLaunchProvider>
        </CoinProvider>
      </AuthProvider>
      </GeoWrapper>
    </BrowserRouter>
  );
}

export default App;
