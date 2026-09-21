import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollToGamesSection } from '../../utils/scrollToGames';
import { useAuth } from '../../context/AuthContext';
import * as affiliateApi from '../../api/affiliate';
import * as promotionsApi from '../../api/promotions';
import * as welcomeSignupBonusApi from '../../api/welcomeSignupBonus';
import { DashboardWelcome } from '../../components/Home/DashboardWelcome';
import { DashboardSidebar } from '../../components/Home/DashboardSidebar';
import { HomePromoTicker } from '../../components/Home/HomePromoTicker';
import { RecentBigWins } from '../../components/Home/RecentBigWins';
import { GamesGridSkeleton } from '../../components/Home/GamesGridSkeleton';
import { LandingPaymentButtons } from '../../components/LandingPaymentButtons';
import { GuestHomePlatforms } from '../../components/Home/GuestHomePlatforms';
import { GuestPlatformsGridSkeleton } from '../../components/Home/GamesSection/GuestPlatformsGrid';
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
const DepositBonusPromoSection = lazy(() =>
  import('../../components/Home/DepositBonusPromoSection').then((m) => ({
    default: m.DepositBonusPromoSection,
  }))
);
const PaymentMethodsSection = lazy(() =>
  import('../../components/PaymentMethodsSection').then((m) => ({
    default: m.PaymentMethodsSection,
  }))
);
const LandingInfoSections = lazy(() =>
  import('../../components/LandingInfoSections').then((m) => ({
    default: m.LandingInfoSections,
  }))
);
const InviteFriendsSection = lazy(() =>
  import('../../components/Home/InviteFriendsSection').then((m) => ({
    default: m.InviteFriendsSection,
  }))
);
const CasinoCrossSellPanel = lazy(() =>
  import('../../components/Home/CasinoCrossSellPanel').then((m) => ({
    default: m.CasinoCrossSellPanel,
  }))
);
const DashboardFx = lazy(() =>
  import('../../components/Home/DashboardFx').then((m) => ({ default: m.DashboardFx }))
);
const DashboardSlotGamesSection = lazy(() =>
  import('../../components/Home/DashboardSlotGamesSection').then((m) => ({
    default: m.DashboardSlotGamesSection,
  }))
);
const GuestFinalCta = lazy(() =>
  import('../../components/Home/GuestFinalCta').then((m) => ({ default: m.GuestFinalCta }))
);

function GamesLoading({ isGuest }) {
  if (isGuest) {
    return (
      <section id="games" className="dash-games-section dash-games-section--guest dash-priority-lobby dash-animate-in">
        <div className="dash-priority-lobby-head">
          <div className="dash-priority-lobby-copy">
            <p className="dash-priority-lobby-kick">Priority lobby</p>
            <h2 className="dash-priority-lobby-title">Top Game Platforms</h2>
          </div>
        </div>
        <GuestPlatformsGridSkeleton count={9} priorityLobby />
      </section>
    );
  }

  return (
    <section id="games" className="dash-games-section dash-games-section--auth dash-animate-in">
      <div className="dash-section-head">
        <p className="dash-priority-lobby-kick">Your lobby</p>
        <h2 className="dash-section-title">Your Platforms</h2>
      </div>
      <div className="dash-games-tabs">
        <span className="dashboard-games-tab active">All Games</span>
        <span className="dashboard-games-tab">My Games</span>
      </div>
      <GamesGridSkeleton />
    </section>
  );
}

function runWhenIdle(fn, timeoutMs = 2500) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(fn, Math.min(timeoutMs, 800));
  return () => window.clearTimeout(id);
}

export function Home() {
  const { isAuthenticated, loading } = useAuth();
  const { hash } = useLocation();
  usePageContentReady(true);
  // While the initial auth check is in-flight (e.g. on refresh), `isAuthenticated`
  // is momentarily false. Guard guest-only landing sections behind the resolved
  // state so logged-in users don't see a flash of landing content.
  const showGuestSections = !loading && !isAuthenticated;
  // Start counting guest scroll gestures immediately (1st = welcome, 3rd = spin).
  useGuestLandingScrollCount(showGuestSections);
  const [welcomeModalImageSrc, setWelcomeModalImageSrc] = useState(null);
  const welcomeModalEnabled = showGuestSections && Boolean(welcomeModalImageSrc);
  const welcomeBonusImageReady = useWelcomeBonusImagePreload(
    welcomeModalEnabled,
    welcomeModalImageSrc
  );
  const { open: welcomeModalOpen, onClose: closeWelcomeModal } = useWelcomeBonusScrollModal({
    enabled: welcomeModalEnabled,
    imageReady: welcomeBonusImageReady,
  });
  const [activeView, setActiveView] = useState('games');
  const [promotions, setPromotions] = useState([]);
  const [affiliateSettings, setAffiliateSettings] = useState(null);
  const [affiliateData, setAffiliateData] = useState(null);
  const [belowFoldReady, setBelowFoldReady] = useState(
    () => typeof document !== 'undefined' && document.readyState === 'complete'
  );

  useEffect(() => {
    if (belowFoldReady) return undefined;
    const ready = () => setBelowFoldReady(true);
    window.addEventListener('load', ready, { once: true });
    return () => window.removeEventListener('load', ready);
  }, [belowFoldReady]);

  useEffect(() => {
    if (!showGuestSections) {
      setWelcomeModalImageSrc(null);
      return undefined;
    }
    let cancelled = false;
    // Fetch immediately so the first-scroll welcome modal is ready early.
    welcomeSignupBonusApi
      .getWelcomeSignupBonusPublic()
      .then((res) => {
        if (cancelled) return;
        const url = typeof res?.modalImageUrl === 'string' ? res.modalImageUrl.trim() : '';
        setWelcomeModalImageSrc(url || null);
      })
      .catch(() => {
        if (!cancelled) setWelcomeModalImageSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showGuestSections]);

  useEffect(() => {
    let cancelled = false;
    const stop = runWhenIdle(() => {
      promotionsApi
        .getPromotions()
        .then((res) => {
          if (cancelled) return;
          const list = res?.promotions ?? [];
          setPromotions(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          if (!cancelled) setPromotions([]);
        });
      affiliateApi
        .getAffiliateSettings()
        .then((res) => {
          if (!cancelled) setAffiliateSettings(res || null);
        })
        .catch(() => {
          if (!cancelled) setAffiliateSettings(null);
        });
    }, 2500);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setAffiliateData(null);
      return undefined;
    }
    let cancelled = false;
    affiliateApi
      .getAffiliateStats()
      .then((res) => {
        if (cancelled) return;
        setAffiliateData(res);
      })
      .catch(() => {
        if (!cancelled) setAffiliateData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (hash !== '#games') return;
    setActiveView('games');
    scrollToGamesSection();
  }, [hash]);

  return (
    <div className="dashboard dash-page">
      {welcomeModalEnabled && (
        <WelcomeBonusModal
          open={welcomeModalOpen}
          onClose={closeWelcomeModal}
          imageReady={welcomeBonusImageReady}
          imageSrc={welcomeModalImageSrc}
        />
      )}
      {belowFoldReady ? (
        <Suspense fallback={null}>
          <DashboardFx />
        </Suspense>
      ) : null}
      <HomePromoTicker promotions={promotions} affiliateSettings={affiliateSettings} />

      <div className="dash-layout dash-layout--sided">
        <DashboardSidebar
          activeView={activeView}
          onSelectView={setActiveView}
          hasSlots
          isAuthenticated={isAuthenticated}
        />

        <div className="dash-main">
          <DashboardWelcome isAuthenticated={isAuthenticated} />

          <h1 className="dash-home-h1">{site.seoTitle || site.platformName}</h1>

          {!isAuthenticated ? <LandingPaymentButtons inline highlight /> : null}

          <RecentBigWins />

          {!loading && isAuthenticated && belowFoldReady ? (
            <Suspense fallback={null}>
              <CasinoCrossSellPanel />
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

          {showGuestSections && belowFoldReady ? (
            <Suspense fallback={null}>
              <DashboardSlotGamesSection catalogOnly />
            </Suspense>
          ) : null}

          {showGuestSections && belowFoldReady && (
            <Suspense fallback={null}>
              <SpinWinSection />
            </Suspense>
          )}

          {showGuestSections && belowFoldReady && (
            <Suspense fallback={null}>
              <DepositBonusPromoSection isAuthenticated={isAuthenticated} />
            </Suspense>
          )}

          {showGuestSections && belowFoldReady && (
            <Suspense fallback={null}>
              <PaymentMethodsSection />
            </Suspense>
          )}

          {showGuestSections && belowFoldReady && (
            <Suspense fallback={null}>
              <LandingInfoSections />
            </Suspense>
          )}

          {showGuestSections && belowFoldReady ? (
            <Suspense fallback={null}>
              <GuestFinalCta />
            </Suspense>
          ) : null}

          {isAuthenticated && belowFoldReady && (
            <div className="dash-invite-wrap dash-animate-in dash-delay-4">
              <Suspense fallback={null}>
                <InviteFriendsSection affiliateData={affiliateData} />
              </Suspense>
            </div>
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
