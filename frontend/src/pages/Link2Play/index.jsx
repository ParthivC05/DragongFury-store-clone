import { lazy, Suspense, memo, useEffect, useState } from 'react';
import { LINK2PLAY_GAMES } from '../../config/link2playGames';
import { getLink2PlayGames } from '../../api/link2play';
import { usePageContentReady } from '../../context/PageReadyContext';
import { useLink2PlayCatalog } from '../../hooks/useLink2PlayCatalog';
import { DashboardSidebar } from '../../components/Home/DashboardSidebar';
import { LandingPaymentButtons } from '../../components/LandingPaymentButtons';
import { Link2PlaySearch } from './components/Link2PlaySearch';
import { Link2PlayFilterChips } from './components/Link2PlayFilterChips';
import { Link2PlayGameList } from './components/Link2PlayGameList';
import './link2play.css';

const LandingFooter = lazy(() =>
  import('../../components/LandingFooter').then((m) => ({ default: m.LandingFooter }))
);

function Link2PlayTitle() {
  return (
    <header className="l2p-page-head">
      <h1 id="l2p-heading" className="l2p-page-title">
        Link<span className="l2p-page-title-accent">2</span>Play
      </h1>
      <p className="l2p-page-sub">Tap a game, then choose how to play</p>
    </header>
  );
}

const Link2PlayCatalog = memo(function Link2PlayCatalog({ games }) {
  const {
    query,
    setQuery,
    clearQuery,
    filter,
    setFilter,
    filters,
    live,
    soon,
    resultCount,
    isSearching,
    isFiltering,
  } = useLink2PlayCatalog(games);

  const showEmpty = live.length === 0 && soon.length === 0 && (isSearching || isFiltering);
  const showLive = filter === 'all' || filter === 'live' || filter === 'popular';
  const showSoon = (filter === 'all' || filter === 'soon') && (soon.length > 0 || filter === 'soon');

  return (
    <div className="l2p-root">
      <Link2PlayTitle />

      <div className="l2p-shell">
        <Link2PlaySearch
          value={query}
          onChange={setQuery}
          onClear={clearQuery}
          resultCount={isSearching ? resultCount : null}
        />
        <Link2PlayFilterChips value={filter} onChange={setFilter} filters={filters} />

        {showEmpty ? (
          <p className="l2p-empty" role="status">
            No games match your search. Try another name.
          </p>
        ) : (
          <>
            {showLive ? (
              <Link2PlayGameList
                label={filter === 'popular' ? 'Popular games' : 'Live games'}
                count={live.length}
                games={live}
                priorityCount={2}
                emptyMessage={
                  filter === 'popular'
                    ? 'No popular games match your filters.'
                    : filter === 'live'
                      ? 'No live games match your filters.'
                      : null
                }
              />
            ) : null}
            {showSoon ? (
              <Link2PlayGameList
                label="Coming soon"
                count={soon.length}
                games={soon}
                mutedCount
                emptyMessage={filter === 'soon' ? 'Nothing coming soon matches yet.' : null}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
});

function useLink2PlayGames() {
  const [games, setGames] = useState(LINK2PLAY_GAMES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLink2PlayGames()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.games) ? res.games.filter(Boolean) : [];
        if (list.length > 0) setGames(list);
      })
      .catch(() => {
        // Keep static fallback if API is unavailable.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { games, ready };
}

export function Link2Play() {
  const { games, ready } = useLink2PlayGames();
  usePageContentReady(ready);

  return (
    <div className="dashboard dash-page">
      <div className="dash-layout dash-layout--sided">
        <DashboardSidebar hasSlots={false} isAuthenticated={false} />

        <div className="dash-main">
          <LandingPaymentButtons inline />

          <section
            className="dash-games-section dash-games-section--guest dash-animate-in l2p-page-section"
            aria-labelledby="l2p-heading"
          >
            {ready ? (
              <Link2PlayCatalog games={games} />
            ) : (
              <div className="l2p-root">
                <Link2PlayTitle />
                <p className="l2p-empty" role="status">
                  Loading games…
                </p>
              </div>
            )}
          </section>

          <Suspense fallback={null}>
            <LandingFooter />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
