import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollToGamesSection } from '../../utils/scrollToGames';
import { useAuth } from '../../context/AuthContext';
import * as welcomeSignupBonusApi from '../../api/welcomeSignupBonus';
import { DashboardSidebar } from '../../components/Home/DashboardSidebar';
import { GamesGridSkeleton } from '../../components/Home/GamesGridSkeleton';
import { GuestHomePlatforms } from '../../components/Home/GuestHomePlatforms';
import { GuestPlatformsGridSkeleton } from '../../components/Home/GamesSection/GuestPlatformsGrid';
import { DragonFuryOnlineHero } from '../../components/Home/DragonFuryOnlineHero';
import { WelcomeBonusModal } from '../../components/Home/WelcomeBonusModal';
import { useWelcomeBonusScrollModal } from '../../hooks/useWelcomeBonusScrollModal';
import { useWelcomeBonusImagePreload } from '../../hooks/useWelcomeBonusImagePreload';
import { useGuestLandingScrollCount } from '../../hooks/useGuestLandingScrollCount';
import { site } from '../../config/site';
import { usePageContentReady } from '../../context/PageReadyContext';

const LandingFooter = lazy(() =>
  import('../../components/LandingFooter').then((m) => ({ default: m.LandingFooter }))
);

const GamesSection = lazy(() =>
  import('../../components/Home/GamesSection').then((m) => ({ default: m.GamesSection }))
);
const SpinWinSection = lazy(() =>
  import('../../components/SpinWinSection').then((m) => ({ default: m.SpinWinSection }))
);
const PaymentMethodsSection = lazy(() =>
  import('../../components/PaymentMethodsSection').then((m) => ({
    default: m.PaymentMethodsSection,
  }))
);
const DashboardSlotGamesSection = lazy(() =>
  import('../../components/Home/DashboardSlotGamesSection').then((m) => ({
    default: m.DashboardSlotGamesSection,
  }))
);

function GamesLoading({ isGuest }) {
  if (isGuest) {
    return (
      <section className="df-other-games" id="games" aria-busy="true">
        <p className="df-games-eyebrow">Also on your account</p>
        <h2 className="df-games-title">TRY OTHER GAMES</h2>
        <GuestPlatformsGridSkeleton count={12} priorityLobby />
      </section>
    );
  }

  return (
    <section id="games" className="dash-games-section dash-games-section--auth dash-animate-in">
      <div className="dash-section-head">
        <p className="dash-priority-lobby-kick">Try Other Games</p>
        <h2 className="dash-section-title">Try Other Games</h2>
      </div>
      <div className="dash-games-tabs">
        <span className="dashboard-games-tab active">All Games</span>
        <span className="dashboard-games-tab">My Games</span>
      </div>
      <GamesGridSkeleton />
    </section>
  );
}

export function Home() {
  const { isAuthenticated, loading, user } = useAuth();
  const { hash } = useLocation();
  usePageContentReady(true);
  // While the initial auth check is in-flight (e.g. on refresh), `isAuthenticated`
  // is momentarily false. Guard guest-only landing sections behind the resolved
  // state so logged-in users don't see a flash of landing content.
  const showGuestSections = !loading && !isAuthenticated;
  // Start counting guest scroll gestures immediately (1st = welcome, 3rd = spin).
  useGuestLandingScrollCount(showGuestSections);
  const [welcomeModalImageSrc, setWelcomeModalImageSrc] = useState(null);
  const [welcomeConfigReady, setWelcomeConfigReady] = useState(!showGuestSections);
  const welcomeModalEnabled = showGuestSections && Boolean(welcomeModalImageSrc);
  const welcomeBonusImageReady = useWelcomeBonusImagePreload(
    welcomeModalEnabled,
    welcomeModalImageSrc
  );
  const { open: welcomeModalOpen, onClose: closeWelcomeModal } = useWelcomeBonusScrollModal({
    guestReady: showGuestSections,
    configReady: welcomeConfigReady,
    hasImage: Boolean(welcomeModalImageSrc),
    imageReady: welcomeBonusImageReady,
  });
  const [activeView, setActiveView] = useState('games');
  const [belowFoldReady, setBelowFoldReady] = useState(
    () => typeof document !== 'undefined' && document.readyState === 'complete'
  );

  useEffect(() => {
    if (belowFoldReady) return undefined;
    const ready = () => setBelowFoldReady(true);
    if (document.readyState === 'complete') {
      ready();
      return undefined;
    }
    window.addEventListener('load', ready, { once: true });
    const timeoutId = window.setTimeout(ready, 600);
    return () => {
      window.removeEventListener('load', ready);
      window.clearTimeout(timeoutId);
    };
  }, [belowFoldReady]);

  useEffect(() => {
    if (!showGuestSections) {
      setWelcomeModalImageSrc(null);
      setWelcomeConfigReady(true);
      return undefined;
    }
    setWelcomeConfigReady(false);
    let cancelled = false;
    welcomeSignupBonusApi
      .getWelcomeSignupBonusPublic()
      .then((res) => {
        if (cancelled) return;
        const url = typeof res?.modalImageUrl === 'string' ? res.modalImageUrl.trim() : '';
        setWelcomeModalImageSrc(url || null);
      })
      .catch(() => {
        if (!cancelled) setWelcomeModalImageSrc(null);
      })
      .finally(() => {
        if (!cancelled) setWelcomeConfigReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showGuestSections]);

  useEffect(() => {
    if (hash !== '#games') return;
    setActiveView('games');
    scrollToGamesSection();
  }, [hash]);

  return (
    <div className="dashboard dash-page dash-page--fury">
      {welcomeModalEnabled && (
        <WelcomeBonusModal
          open={welcomeModalOpen}
          onClose={closeWelcomeModal}
          imageReady={welcomeBonusImageReady}
          imageSrc={welcomeModalImageSrc}
        />
      )}

      <div className="dash-layout dash-layout--sided">
        {!showGuestSections ? (
          <DashboardSidebar
            activeView={activeView}
            onSelectView={setActiveView}
            hasSlots
            isAuthenticated={isAuthenticated}
          />
        ) : null}

        <div className="dash-main">
          {showGuestSections ? (
            <DragonFuryOnlineHero />
          ) : isAuthenticated ? (
            <div className="df-auth-welcome">
              <h1>
                Welcome Back
                {user?.username || user?.firstName ? `, ${user.username || user.firstName}` : ''}
              </h1>
              <h2 className="dash-home-h1 sr-only">{site.seoTitle || site.platformName}</h2>
            </div>
          ) : null}

          {showGuestSections ? (
            <Suspense fallback={null}>
              <DashboardSlotGamesSection catalogOnly />
            </Suspense>
          ) : null}

          {!loading && isAuthenticated ? (
            <Suspense fallback={<GamesLoading isGuest={false} />}>
              <GamesSection />
            </Suspense>
          ) : !loading && !isAuthenticated ? (
            <GuestHomePlatforms />
          ) : (
            <GamesLoading isGuest />
          )}

          {showGuestSections && belowFoldReady && (
            <Suspense fallback={null}>
              <SpinWinSection />
            </Suspense>
          )}

          {showGuestSections && belowFoldReady && (
            <Suspense fallback={null}>
              <PaymentMethodsSection />
            </Suspense>
          )}

          {belowFoldReady ? (
            <Suspense fallback={null}>
              <LandingFooter />
            </Suspense>
          ) : null}
        </div>
      </div>
    </div>
  );
}
