import { lazy, Suspense, useEffect } from 'react';
import { AppLoader } from '../../components/AppLoader';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isHiddenSlotCategoryId } from '../../utils/gitslotparkLandingGames';

const GamesSection = lazy(() =>
  import('../../components/Home/GamesSection').then((m) => ({ default: m.GamesSection }))
);

function resetGamesPageScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollTop = 0;
  document.body.scrollLeft = 0;
  const main = document.querySelector('.dash-main');
  if (main) {
    main.scrollTop = 0;
    main.scrollLeft = 0;
  }
}

/**
 * Authenticated Games page — matches dragonfury.online/games
 * (route heading + lobby search/filters/grid, not the old carousel lobby).
 */
export function AllSlotGames() {
  const { isAuthenticated, loading } = useAuth();
  const { categoryId } = useParams();

  useEffect(() => {
    resetGamesPageScroll();
  }, [categoryId]);

  if (isHiddenSlotCategoryId(categoryId)) {
    return <Navigate to="/casino" replace />;
  }

  const initialFilter = (() => {
    const id = String(categoryId || '').toLowerCase();
    if (!id) return 'all';
    if (id === 'slot') return 'slots';
    if (id === 'live' || id === 'livecasino') return 'live-casino';
    if (id === 'platforms') return 'web';
    if (id === 'favorites' || id === 'my-games') return 'registered';
    if (id === 'table' || id === 'poker') return 'table-games';
    if (id === 'crash') return 'crash-game';
    if (id === 'instant') return 'instant-win';
    if (id === 'scratch') return 'scratch-cards';
    if (id === 'casual') return 'casual-games';
    return id;
  })();

  return (
    <div className="dashboard dash-page df-games-page">
      <div className="dash-layout">
        <div className="dash-main">
          <header className="df-route-heading" aria-label="Games">
            <span className="df-route-heading__eyebrow">Game lobby</span>
            <h1 className="df-route-heading__title">Games</h1>
          </header>

          {!loading ? (
            <Suspense fallback={<AppLoader fillPage={false} message="Loading games" />}>
              <GamesSection
                pageMode
                initialFilter={isAuthenticated ? initialFilter : undefined}
              />
            </Suspense>
          ) : null}
        </div>
      </div>
    </div>
  );
}
