import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import * as scorpioApi from '../../api/scorpio';
import { SCORPIO_GAMES_SLUG } from '../../config/scorpio';
import { SlotGameCard } from '../../components/SlotGames/SlotGameCard';
import { SlotGameCardSkeleton } from '../../components/SlotGames/SlotGameCardSkeleton';
import { applyRobotsMeta } from '../../utils/pageSeo';
import './ScorpioGames.css';

const SKELETON_COUNT = 12;
const PAGE_SIZE = 48;
const SECTION_ORDER = ['Slots', 'Live Casino', 'Other'];

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function extractGames(res) {
  if (Array.isArray(res?.games)) return res.games;
  if (Array.isArray(res?.data?.games)) return res.data.games;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

function mapScorpioGame(game) {
  const gameCode = String(game.gameCode || game.gameId || game.gameid || '').trim();
  const providerId = Number(game.providerId);
  const icon = typeof game.icon === 'string' ? game.icon.trim() : '';
  const title = game.name || game.gameName || 'Game';
  const gameTypeLabel = game.gameTypeLabel
    || (Number(game.gameType) === 1 ? 'Live Casino' : Number(game.gameType) === 2 ? 'Other' : 'Slots');

  return {
    id: `scorpio-${providerId || 0}-${gameCode || title}`,
    gameid: gameCode || null,
    gameCode,
    providerId: Number.isFinite(providerId) ? providerId : null,
    provider: 'scorpio',
    providerName: game.providerName || '',
    symbol: (gameCode || title).toLowerCase(),
    title,
    name: title,
    image: icon && icon.startsWith('http') && !icon.toLowerCase().includes('gamevault') ? icon : '',
    iconUrls: icon && icon.startsWith('http') && !icon.toLowerCase().includes('gamevault') ? [icon] : [],
    gameType: game.gameType,
    gameTypeLabel,
  };
}

function GameGrid({ games, onPlay, launchLoading, launchingGameId }) {
  return (
    <div className="dash-slot-games-grid">
      {games.map((game) => (
        <SlotGameCard
          key={game.id}
          game={game}
          onPlay={onPlay}
          playing={launchLoading && launchingGameId === `${game.providerId}-${game.gameCode}`}
          usePlaceholder
          showTitle
          imageFit="cover"
        />
      ))}
    </div>
  );
}

export function ScorpioGames() {
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
        const status = await scorpioApi.getScorpioStatus();
        if (cancelled) return;
        setConfigured(Boolean(status?.enabled !== false && (status?.configured || status?.launchConfigured)));
        if (status?.enabled === false) {
          setGames([]);
          return;
        }
        const res = await scorpioApi.getScorpioGames();
        if (cancelled) return;
        setGames(extractGames(res).map(mapScorpioGame).filter((game) => game.gameid));
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
      const provider = normalizeSearch(game.providerName);
      return name.includes(q) || provider.includes(q);
    });
  }, [games, search]);

  const sections = useMemo(() => {
    const grouped = new Map();
    for (const game of visibleGames) {
      const key = SECTION_ORDER.includes(game.gameTypeLabel) ? game.gameTypeLabel : 'Other';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(game);
    }
    return SECTION_ORDER
      .filter((key) => grouped.has(key))
      .map((key) => ({ title: key, catalog: grouped.get(key) }));
  }, [visibleGames]);

  const openPlay = useCallback(
    (game) => {
      const gameCode = game?.gameCode || game?.gameid;
      if (!gameCode || launchLoading) return;
      const providerId = Number(game.providerId);
      if (!Number.isFinite(providerId) || providerId <= 0) return;

      setLaunchLoading(true);
      setLaunchingGameId(`${providerId}-${gameCode}`);
      navigate(
        `/play/${encodeURIComponent(gameCode)}?provider=${SCORPIO_GAMES_SLUG}&g=${encodeURIComponent(providerId)}`,
        {
          state: {
            provider: SCORPIO_GAMES_SLUG,
            providerId,
            gameCode,
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
            <section key={section.title} className="dash-scorpio-section">
              <h2 className="dash-scorpio-section-title">{section.title}</h2>
              {visibleCatalog.length > 0 ? (
                <div className="dash-scorpio-catalog">
                  <GameGrid
                    games={visibleCatalog}
                    onPlay={openPlay}
                    launchLoading={launchLoading}
                    launchingGameId={launchingGameId}
                  />
                </div>
              ) : null}
              {remaining > 0 ? (
                <div className="dash-scorpio-more-wrap">
                  <p className="dash-scorpio-more-status">
                    Showing {visibleCatalog.length} of {section.catalog.length}
                  </p>
                  <button
                    type="button"
                    className="dash-scorpio-more"
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
