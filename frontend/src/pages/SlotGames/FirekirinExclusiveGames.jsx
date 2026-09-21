import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { DashboardSidebar } from '../../components/Home/DashboardSidebar';
import { DashboardFx } from '../../components/Home/DashboardFx';
import { DashboardWelcome } from '../../components/Home/DashboardWelcome';
import { SlotGamesCarousel } from '../../components/SlotGames/SlotGamesCarousel';
import { SlotGamesSearchBar } from '../../components/SlotGames/SlotGamesSearchBar';
import { AppLoader } from '../../components/AppLoader';
import { FirekirinExclusiveOverlays } from '../../components/Home/FirekirinExclusiveSlider';
import { useFirekirinExclusiveGames } from '../../hooks/useFirekirinExclusiveGames';
import { useEnabledSlotProviders } from '../../hooks/useEnabledSlotProviders';
import '../../components/SlotGames/slot-lobby-v5.css';

const PAGE_SIZE = 80;

function normalizeSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function resetPageScroll() {
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

export function FirekirinExclusiveGames() {
  const { isAuthenticated } = useAuth();
  const { hasSlotProviders } = useEnabledSlotProviders();
  const {
    games,
    loading,
    launchingGameId,
    handlePlay,
    createPrompt,
    creatingAccount,
    handleCreateAccount,
    closeCreatePrompt,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    activationBonusType,
  } = useFirekirinExclusiveGames({ enabled: isAuthenticated, limit: null });
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    resetPageScroll();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const query = normalizeSearch(search);
  const filteredGames = useMemo(() => {
    if (!query) return games;
    return games.filter((game) => normalizeSearch(game.title).includes(query));
  }, [games, query]);
  const visibleGames = filteredGames.slice(0, visibleCount);
  const hasMore = visibleCount < filteredGames.length;

  const clearSearch = useCallback(() => setSearch(''), []);
  const loadMore = useCallback(() => {
    setVisibleCount((count) => count + PAGE_SIZE);
  }, []);

  return (
    <div className="dashboard dash-page slot-lobby-v5">
      <DashboardFx />

      <div className="dash-layout dash-layout--sided">
        <DashboardSidebar
          activeView="games"
          hasSlots={hasSlotProviders}
          isAuthenticated={isAuthenticated}
        />

        <div className="dash-main">
          <DashboardWelcome isAuthenticated={isAuthenticated} placement="casino" />

          <section id="slot-games" className="dash-slot-carousel-section" aria-busy={loading || undefined}>
            <div className="dash-section-head">
              <h2 className="dash-section-title">Firekirin Exclusive</h2>
              <p className="dash-section-sub">Browse and play</p>
            </div>

            <SlotGamesSearchBar
              value={search}
              onChange={setSearch}
              onClear={clearSearch}
              resultCount={query ? filteredGames.length : null}
              disabled={loading && games.length === 0}
              placeholder="Type a game name…"
            />

            {loading && games.length === 0 ? (
              <div className="dash-slot-games-loader">
                <AppLoader fillPage={false} message="Loading Firekirin games" />
              </div>
            ) : filteredGames.length === 0 ? (
              <div className="dash-games-empty dash-animate-in">
                <span className="dash-games-empty-icon" aria-hidden>🎰</span>
                <p className="dash-games-empty-title">No games found</p>
                <p className="dash-games-empty-sub">
                  {query
                    ? `Nothing matched “${query}” in Firekirin Exclusive.`
                    : 'No Firekirin Exclusive games are available right now.'}
                </p>
              </div>
            ) : (
              <>
                <div className="dash-slot-carousel-panel dash-slot-carousel-root">
                  <SlotGamesCarousel
                    label=""
                    games={visibleGames}
                    ariaLabel="Firekirin Exclusive games"
                    grid
                    gridClassName="dash-slot-catalog-grid dash-slot-search-grid"
                    onPlay={handlePlay}
                    playingGameId={launchingGameId}
                  />
                </div>
                {hasMore ? (
                  <div className="dash-slot-load-more-wrap">
                    <button type="button" className="dash-slot-load-more-btn" onClick={loadMore}>
                      Load more games
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      <FirekirinExclusiveOverlays
        createPrompt={createPrompt}
        creatingAccount={creatingAccount}
        onCreateAccount={handleCreateAccount}
        onCloseCreatePrompt={closeCreatePrompt}
        depositRequiredModalOpen={depositRequiredModalOpen}
        closeDepositRequiredModal={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </div>
  );
}
