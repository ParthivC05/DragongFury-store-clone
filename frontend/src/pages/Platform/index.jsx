import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { STORE_CODE } from '../../config/site';
import * as gamesApi from '../../api/games';
import * as promotionsApi from '../../api/promotions';
import * as affiliateApi from '../../api/affiliate';
import { dedupeGamesForListing } from '../../utils/dedupeGames';
import { DashboardSidebar } from '../../components/Home/DashboardSidebar';
import { DashboardFx } from '../../components/Home/DashboardFx';
import { DashboardWelcome } from '../../components/Home/DashboardWelcome';
import { HomePromoTicker } from '../../components/Home/HomePromoTicker';
import { LandingFooter } from '../../components/LandingFooter';
import {
  LockedPlatformGameCard,
  LockedPlatformGameCardSkeleton,
} from '../../components/Games/LockedPlatformGameCard';

/**
 * Guest Platforms lobby — real store games with locked dummy credentials UI.
 * Authenticated users are sent to the live games section on Home.
 */
export function PlatformGames() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [promotions, setPromotions] = useState([]);
  const [affiliateSettings, setAffiliateSettings] = useState(null);

  usePageContentReady(!gamesLoading);

  useEffect(() => {
    if (authLoading || isAuthenticated) return undefined;
    let cancelled = false;
    setGamesLoading(true);
    gamesApi
      .listGames({ store_code: STORE_CODE })
      .then((res) => {
        if (cancelled) return;
        const list = res?.games ?? [];
        setGames(dedupeGamesForListing(list));
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setGamesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading || isAuthenticated) return undefined;
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading || isAuthenticated) return undefined;
    let cancelled = false;
    affiliateApi
      .getAffiliateSettings()
      .then((res) => {
        if (!cancelled) setAffiliateSettings(res || null);
      })
      .catch(() => {
        if (!cancelled) setAffiliateSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const sortedGames = useMemo(
    () =>
      [...games].sort((a, b) => {
        const nameA = String(a?.name || '').toLowerCase();
        const nameB = String(b?.name || '').toLowerCase();
        return nameA.localeCompare(nameB) || (a?.id || 0) - (b?.id || 0);
      }),
    [games]
  );

  if (authLoading) {
    return <div className="dash-page" style={{ minHeight: '40vh' }} aria-busy="true" />;
  }

  if (isAuthenticated) {
    return <Navigate to={{ pathname: '/', hash: '#games' }} state={{ from: location }} replace />;
  }

  return (
    <div className="dashboard dash-page dash-platform-page">
      <DashboardFx />
      <HomePromoTicker promotions={promotions} affiliateSettings={affiliateSettings} />

      <div className="dash-layout dash-layout--sided">
        <DashboardSidebar activeView="platforms" hasSlots isAuthenticated={false} />

        <div className="dash-main">
          <DashboardWelcome isAuthenticated={false} />

          <section className="dash-games-section dash-games-section--guest dash-platform-locked-section" aria-labelledby="platform-locked-title">
            <div className="dash-section-head">
              <h2 id="platform-locked-title" className="dash-section-title dash-platforms-title">
                Game <span className="dash-platforms-title-accent">Platforms</span>
              </h2>
              <p className="dash-platform-locked-lead">
                Explore every platform we offer. Sign up free to unlock credentials and play.
              </p>
            </div>

            {gamesLoading ? (
              <LockedPlatformGameCardSkeleton />
            ) : sortedGames.length === 0 ? (
              <div className="dash-games-empty">
                <p className="dash-games-empty-title">No platforms available yet</p>
                <p className="dash-games-empty-text">Check back soon — new games are added regularly.</p>
              </div>
            ) : (
              <div className="dash-locked-list" role="list" aria-label="Locked platform games">
                {sortedGames.map((game, i) => (
                  <div
                    key={game.id ?? `locked-platform-${i}`}
                    className={`dash-animate-in dash-delay-${Math.min((i % 6) + 1, 6)}`}
                    role="listitem"
                  >
                    <LockedPlatformGameCard game={game} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <LandingFooter />
        </div>
      </div>
    </div>
  );
}
