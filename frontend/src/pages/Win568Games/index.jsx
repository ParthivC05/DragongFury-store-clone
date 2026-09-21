import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import * as win568Api from '../../api/win568';
import { WIN568_GAMES_SLUG } from '../../config/win568';
import { mapWin568ToCarouselGame } from '../../utils/gitslotparkLandingGames';
import { SlotGameCard } from '../../components/SlotGames/SlotGameCard';
import { SlotGameCardSkeleton } from '../../components/SlotGames/SlotGameCardSkeleton';
import { applyRobotsMeta } from '../../utils/pageSeo';
import './Win568Games.css';

const SKELETON_COUNT = 12;
const PAGE_SIZE = 48;
const SECTION_ORDER = ['Sportsbook', 'Live Casino', 'Slots & Games', 'WanMei'];

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function extractGames(res) {
  if (Array.isArray(res?.games)) return res.games;
  if (Array.isArray(res?.data?.games)) return res.data.games;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

function isLobbyTile(game) {
  const gameid = Number(game.gameid);
  if (!Number.isFinite(gameid)) return false;
  if (gameid === 0) return true;
  if (String(game.portfolio) === 'Games' && (gameid === 6101 || gameid === 602801)) return true;
  return false;
}

function sectionFor(game) {
  const portfolio = String(game.portfolio || '');
  const gpId = Number(game.gpId);
  if (
    portfolio === 'SportsBook'
    || portfolio === 'VirtualSports'
    || portfolio === 'ThirdPartySportsBook'
    || portfolio === '568WinSportsbook'
  ) {
    return 'Sportsbook';
  }
  if (portfolio === 'Casino') return 'Live Casino';
  if (portfolio === 'Games') return 'Slots & Games';
  if (gpId === 16 || gpId === 1029 || gpId === 1016 || gpId === 14 || gpId === 1) return 'Slots & Games';
  if (gpId === 0) return 'WanMei';
  return 'Slots & Games';
}

function GameGrid({ games, onPlay, launchLoading, launchingGameId }) {
  return (
    <div className="dash-slot-games-grid">
      {games.map((game) => (
        <SlotGameCard
          key={game.id}
          game={game}
          onPlay={onPlay}
          playing={launchLoading && launchingGameId === `${game.portfolio || 'SeamlessGame'}-${game.gpId}-${game.gameid}`}
          usePlaceholder={false}
          showTitle
        />
      ))}
    </div>
  );
}

export function Win568Games() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [limits, setLimits] = useState({});
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState(null);

  useEffect(() => {
    applyRobotsMeta('noindex, nofollow');
    return () => applyRobotsMeta(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setLimits({});
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const status = await win568Api.getWin568Status();
        if (cancelled) return;
        const ready = Boolean(status?.configured || status?.launchConfigured);
        setConfigured(ready);
        const res = await win568Api.getWin568Games();
        if (cancelled) return;
        const mapped = extractGames(res)
          .map(mapWin568ToCarouselGame)
          .filter((game) => game.gameid != null)
          .map((game) => ({
            ...game,
            name: game.title,
            image: game.image,
          }));
        setGames(mapped);
      } catch (e) {
        if (!cancelled) {
          setGames([]);
          toast.error(e.message || 'Unable to load games.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const visibleGames = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return games;
    return games.filter((game) => {
      const name = normalizeSearch(game.name || game.title);
      const provider = normalizeSearch(game.portfolio || game.symbol);
      return name.includes(q) || provider.includes(q);
    });
  }, [games, search]);

  const sections = useMemo(() => {
    const grouped = new Map();
    for (const game of visibleGames) {
      const key = sectionFor(game);
      if (!grouped.has(key)) grouped.set(key, { lobbies: [], catalog: [] });
      if (isLobbyTile(game)) grouped.get(key).lobbies.push(game);
      else grouped.get(key).catalog.push(game);
    }
    return SECTION_ORDER
      .filter((key) => grouped.has(key))
      .map((key) => ({
        title: key,
        lobbies: grouped.get(key).lobbies,
        catalog: grouped.get(key).catalog,
      }));
  }, [visibleGames]);

  const openPlay = useCallback(
    (game) => {
      const gameid = game?.gameid;
      if (gameid == null || launchLoading) return;
      const gpid = Number.isFinite(Number(game.gpId)) ? Number(game.gpId) : 10000;
      const portfolio = game.portfolio || 'SeamlessGame';
      const isLobby = Number(gameid) === 0;
      const playId = isLobby ? gpid : gameid;

      setLaunchLoading(true);
      setLaunchingGameId(`${portfolio}-${gpid}-${gameid}`);
      navigate(
        `/play/${encodeURIComponent(playId)}?provider=${WIN568_GAMES_SLUG}&g=${encodeURIComponent(gpid)}&p=${encodeURIComponent(portfolio)}&gid=${encodeURIComponent(gameid)}`,
        {
          state: {
            provider: WIN568_GAMES_SLUG,
            gpid,
            portfolio,
            gameid,
            name: game.title || game.name || 'Game',
            returnTo: location.pathname,
            image: game.image || '',
            iconUrls: game.iconUrls || [],
          },
        }
      );
      setLaunchLoading(false);
      setLaunchingGameId(null);
    },
    [launchLoading, location.pathname, navigate]
  );

  const showMore = useCallback((title) => {
    setLimits((current) => ({
      ...current,
      [title]: (current[title] || PAGE_SIZE) + PAGE_SIZE,
    }));
  }, []);

  return (
    <div className="dash-page dash-slot-games-page w-full min-w-0">
      <header className="dash-deposit-header dash-animate-in">
        <h1 className="dash-deposit-title">Games</h1>
        <p className="dash-deposit-sub">
          {loading
            ? 'Loading catalog…'
            : games.length > 0
              ? `${games.length} titles — pick one to play.`
              : 'No games available.'}
        </p>
      </header>

      <div className="dash-slot-games-toolbar dash-animate-in dash-delay-1">
        <label className="dash-slot-games-search-wrap">
          <input
            type="search"
            className="dash-slot-games-search"
            placeholder="Search games…"
            aria-label="Search games"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
        </label>
      </div>

      {loading ? (
        <div className="dash-slot-games-grid" aria-busy="true" aria-label="Loading games">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SlotGameCardSkeleton key={`sk-${i}`} />
          ))}
        </div>
      ) : !configured && games.length === 0 ? (
        <div className="dash-games-empty dash-animate-in">
          <span className="dash-games-empty-icon" aria-hidden>⚙️</span>
          <p className="dash-games-empty-title">Games are not available</p>
          <p className="dash-games-empty-sub">Please try again later.</p>
        </div>
      ) : visibleGames.length === 0 ? (
        <div className="dash-games-empty dash-animate-in">
          <span className="dash-games-empty-icon" aria-hidden>🎰</span>
          <p className="dash-games-empty-title">No games found</p>
          <p className="dash-games-empty-sub">Try another search.</p>
        </div>
      ) : (
        sections.map((section) => {
          const limit = limits[section.title] || PAGE_SIZE;
          const visibleCatalog = section.catalog.slice(0, limit);
          const remaining = section.catalog.length - visibleCatalog.length;
          return (
            <section key={section.title} className="dash-win568-section">
              <h2 className="dash-win568-section-title">{section.title}</h2>
              {section.lobbies.length > 0 ? (
                <GameGrid
                  games={section.lobbies}
                  onPlay={openPlay}
                  launchLoading={launchLoading}
                  launchingGameId={launchingGameId}
                />
              ) : null}
              {visibleCatalog.length > 0 ? (
                <div className={section.lobbies.length > 0 ? 'dash-win568-catalog' : undefined}>
                  <GameGrid
                    games={visibleCatalog}
                    onPlay={openPlay}
                    launchLoading={launchLoading}
                    launchingGameId={launchingGameId}
                  />
                </div>
              ) : null}
              {remaining > 0 ? (
                <div className="dash-win568-more-wrap">
                  <p className="dash-win568-more-status">
                    Showing {section.lobbies.length + visibleCatalog.length} of{' '}
                    {section.lobbies.length + section.catalog.length}
                  </p>
                  <button
                    type="button"
                    className="dash-win568-more"
                    onClick={() => showMore(section.title)}
                  >
                    Load more ({remaining} left)
                  </button>
                </div>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
