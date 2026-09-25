import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GuestSlotSpinWheelModal } from '../SpinWheel/GuestSlotSpinWheelModal';
import { canGuestLandingSpin } from '../SpinWheel/guestLandingSpinCooldown';
import { slotFavoriteId } from '../../utils/gameFavorites';
import { GameFavoriteButton } from './GameFavoriteButton';
import { useGuestLandingScrollCount, isWelcomeLandingBlocked } from '../../hooks/useGuestLandingScrollCount';

const PREVIEW_ROWS = 3;
const SPIN_MODAL_SCROLL = 3;
const GUEST_SLOTS_SPIN_MODAL_KEY = 'guest_slots_spin_modal_shown';

const TAB_ORDER = [
  'all',
  'slots',
  'fishing',
  'table-games',
  'live-casino',
  'crash-game',
  'instant-win',
  'shooting',
  'keno',
  'scratch-cards',
  'lottery',
  'plinko',
  'bingo',
  'casual-games',
  'others',
];
const FALLBACK_TABS = [
  'video-poker',
  'new-games',
  'trending-games',
  'hot-games',
  'popular-games',
  'classic-slots',
];

const TABLE_TITLE_RE =
  /\b(poker|blackjack|roulette|baccarat|craps|sic[\s-]?bo|teen[\s-]?patti|andar[\s-]?bahar|hold'?em|pai[\s-]?gow|casino war|three card|video poker)\b/i;

const TAB_ICONS = {
  slots: '/df-online/club-icons/slots-777.png',
  fishing: '/df-online/club-icons/fish.webp',
  'table-games': '/df-online/club-icons/cards.webp',
  'live-casino': '/df-online/club-icons/dice.webp',
  others: '/df-online/club-icons/gamepad.png',
  bingo: '/df-online/club-icons/bingo.svg',
  shooting: '/df-online/club-icons/shooting.svg',
  'crash-game': '/df-online/club-icons/crash.svg',
  keno: '/df-online/club-icons/keno.svg',
  'scratch-cards': '/df-online/club-icons/scratch.svg',
  lottery: '/df-online/club-icons/lottery.svg',
  plinko: '/df-online/club-icons/plinko.svg',
  'casual-games': '/df-online/club-icons/casual.svg',
  'instant-win': '/df-online/club-icons/instant.svg',
  'video-poker': '/df-online/club-icons/cards.webp',
};

const TAB_LABELS = {
  all: 'All',
  slots: 'Slots',
  fishing: 'Fishing',
  'table-games': 'Table',
  'live-casino': 'Live',
  others: 'Other',
  bingo: 'Bingo',
  shooting: 'Shooting',
  'crash-game': 'Crash',
  'instant-win': 'Instant',
  keno: 'Keno',
  'scratch-cards': 'Scratch',
  lottery: 'Lottery',
  plinko: 'Plinko',
  'casual-games': 'Casual',
  'video-poker': 'Video Poker',
  'new-games': 'New',
  'trending-games': 'Trending',
  'hot-games': 'Hot',
  'popular-games': 'Popular',
  'classic-slots': 'Classic',
};

const TAB_SOURCE_IDS = {
  slots: new Set([
    'slots',
    'classic-slots',
    'zesus',
    'olympus',
    'candy',
    'animal',
    'buffalo-blast',
    'new-games',
    'trending-games',
    'hot-games',
    'popular-games',
    'top-games',
  ]),
  fishing: new Set(['fishing', 'fishing-games', 'top-fishing']),
  'table-games': new Set(['table-games', 'video-poker']),
  'live-casino': new Set(['live-casino']),
  'crash-game': new Set(['crash-game']),
  'instant-win': new Set(['instant-win']),
  shooting: new Set(['shooting']),
  keno: new Set(['keno']),
  'scratch-cards': new Set(['scratch-cards']),
  lottery: new Set(['lottery']),
  plinko: new Set(['plinko']),
  bingo: new Set(['bingo']),
  'casual-games': new Set(['casual-games']),
  others: new Set(['others']),
};

function tabLabel(id) {
  return TAB_LABELS[id] || id;
}

function resolveTabId(categoryId) {
  const id = String(categoryId || '').trim();
  if (!id || id === 'recently-played') return 'slots';
  if (TAB_LABELS[id]) return id;
  for (const [tabId, sources] of Object.entries(TAB_SOURCE_IDS)) {
    if (sources.has(id)) return tabId;
  }
  return 'slots';
}

function isTableLikeGame(game) {
  const hay = [
    game?.title,
    game?.name,
    game?.gameType,
    game?.symbol,
    Array.isArray(game?.categories) ? game.categories.join(' ') : game?.categories,
  ]
    .filter(Boolean)
    .join(' ');
  return TABLE_TITLE_RE.test(hay);
}

function uniqueGames(list) {
  const seen = new Set();
  const out = [];
  for (const game of list || []) {
    const key = String(game?.id || game?.gameid || game?.title || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }
  return out;
}

function gamesFromSources(tabId, categories) {
  const sources = TAB_SOURCE_IDS[tabId];
  if (!sources) return [];
  return uniqueGames(
    (categories || [])
      .filter((category) => sources.has(category.id))
      .flatMap((category) => category.games || [])
  );
}

function gamesForTab(tabId, categories, allGames) {
  if (tabId === 'all') return uniqueGames(allGames);

  if (TAB_SOURCE_IDS[tabId]) {
    const fromCats = gamesFromSources(tabId, categories);
    if (tabId === 'table-games' || tabId === 'live-casino') {
      return uniqueGames([...fromCats, ...(allGames || []).filter(isTableLikeGame)]);
    }
    if (fromCats.length) return fromCats;
  }

  const direct = (categories || []).find((c) => c.id === tabId);
  if (direct?.games?.length) return uniqueGames(direct.games);
  return [];
}

function gameCategoryId(game, categories) {
  const match = (categories || []).find((c) => c.games?.some((g) => g.id === game.id));
  const fromCat = resolveTabId(match?.id || game.categoryId || '');
  if (fromCat === 'fishing') return 'fishing';
  if (fromCat === 'table-games' || isTableLikeGame(game)) return 'table-games';
  return fromCat || 'slots';
}

function useGridColumns(ref) {
  const [cols, setCols] = useState(3);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const read = () => {
      const count = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (count > 0) setCols(count);
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return cols;
}

/**
 * Casino catalog grid — guest landing + auth lobby filters.
 */
export function SlotGamesCatalogGrid({
  games,
  categories = [],
  onPlay,
  playingGameId,
  loading = false,
  guestSpinModal = false,
  embedded = false,
  initialTab = 'all',
  hideIntro = false,
  showCategoryTabs = false,
  lobbyMode = false,
  favoritesOnly = false,
}) {
  const gridRef = useRef(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'all');
  const [visiblePages, setVisiblePages] = useState(1);
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const showGuestSpinModal = guestSpinModal && !isAuthenticated;
  const guestScrollCount = useGuestLandingScrollCount(showGuestSpinModal);
  const cols = useGridColumns(gridRef);

  const allGames = useMemo(() => (Array.isArray(games) ? games : []), [games]);
  const categoryList = useMemo(
    () => (Array.isArray(categories) ? categories : []),
    [categories]
  );

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const tabCounts = useMemo(() => {
    const counts = { all: allGames.length };
    const ids = new Set([
      ...TAB_ORDER,
      ...FALLBACK_TABS,
      ...categoryList.map((c) => c.id).filter((id) => id && id !== 'recently-played'),
    ]);
    for (const id of ids) {
      if (id === 'all') continue;
      counts[id] = gamesForTab(id, categoryList, allGames).length;
    }
    return counts;
  }, [allGames, categoryList]);

  const tabs = useMemo(() => {
    const preferred = TAB_ORDER.filter((id) => id === 'all' || (tabCounts[id] || 0) > 0);
    const mappedIntoPreferred = new Set(
      Object.values(TAB_SOURCE_IDS).flatMap((set) => [...set])
    );
    const extras = Object.keys(tabCounts)
      .filter((id) => {
        if (id === 'all' || preferred.includes(id)) return false;
        if (id === 'recently-played' || id === 'top-fishing' || id === 'top-games') return false;
        if (mappedIntoPreferred.has(id)) return false;
        return (tabCounts[id] || 0) > 0;
      })
      .sort((a, b) => (tabCounts[b] || 0) - (tabCounts[a] || 0));
    return [...preferred, ...extras];
  }, [tabCounts]);

  const filteredGames = useMemo(
    () => (favoritesOnly ? uniqueGames(allGames) : gamesForTab(activeTab, categoryList, allGames)),
    [activeTab, allGames, categoryList, favoritesOnly]
  );

  const pageSize = Math.max(cols * PREVIEW_ROWS, PREVIEW_ROWS);
  const visibleGames = filteredGames.slice(0, pageSize * visiblePages);
  const remaining = Math.max(0, filteredGames.length - visibleGames.length);

  const goSignup = useCallback(() => {
    navigate(signupTo);
  }, [navigate, signupTo]);

  const handleCardPlay = useCallback(
    (game) => {
      if (!isAuthenticated) {
        goSignup();
        return;
      }
      onPlay?.(game);
    },
    [goSignup, isAuthenticated, onPlay]
  );

  const selectTab = useCallback((nextId) => {
    setActiveTab(nextId);
    setVisiblePages(1);
  }, []);

  const loadMore = useCallback(() => {
    setVisiblePages((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab('all');
      setVisiblePages(1);
    }
  }, [activeTab, tabs]);

  useEffect(() => {
    setVisiblePages(1);
  }, [filteredGames.length, cols]);

  useEffect(() => {
    if (!showGuestSpinModal || loading) return;
    if (guestScrollCount < SPIN_MODAL_SCROLL) return;

    try {
      if (sessionStorage.getItem(GUEST_SLOTS_SPIN_MODAL_KEY) === '1') return;
    } catch (_) {
      /* ignore */
    }

    if (isWelcomeLandingBlocked()) return;
    if (!canGuestLandingSpin()) return;

    try {
      sessionStorage.setItem(GUEST_SLOTS_SPIN_MODAL_KEY, '1');
    } catch (_) {
      /* ignore */
    }
    setSpinModalOpen(true);
  }, [guestScrollCount, loading, showGuestSpinModal]);

  if (!loading && allGames.length === 0) {
    return null;
  }

  const totalCount = allGames.length;

  return (
    <section
      className={`df-games-included${embedded ? ' df-games-included--embedded' : ''}${lobbyMode ? ' df-games-included--lobby' : ''}`}
      aria-labelledby={hideIntro ? undefined : 'df-games-title'}
    >
      {!hideIntro ? (
        <>
          <p className="df-games-eyebrow">All in one game</p>
          <h2 className="df-games-title" id="df-games-title">
            GAMES INCLUDED
          </h2>
          <p className="df-games-sub">
            One account unlocks <strong>{totalCount || 'these'} titles</strong> — slots, fishing and table
            games. Every one of them is inside.
          </p>
        </>
      ) : null}

      {tabs.length > 1 && (!embedded || showCategoryTabs) && !favoritesOnly ? (
        <div
          className={`df-games-tabs${embedded ? ' df-games-tabs--embedded' : ''}`}
          role="tablist"
          aria-label="Game categories"
        >
          {tabs.map((id) => {
            const count = tabCounts[id] || 0;
            const icon = TAB_ICONS[id];
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`df-game-tab-${id}`}
                aria-controls="df-games-panel"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`df-games-tab${selected ? ' df-games-tab--active' : ''}`}
                onClick={() => selectTab(id)}
              >
                {icon ? (
                  <img
                    className="df-games-tab__glyph"
                    src={icon}
                    alt=""
                    width={64}
                    height={50}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                {tabLabel(id)}
                <span className="df-games-tab__n">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id="df-games-panel"
        role="tabpanel"
        aria-labelledby={`df-game-tab-${activeTab}`}
        aria-busy={loading || undefined}
      >
        <div
          ref={gridRef}
          className={`df-games-grid df-games-grid--dense${lobbyMode ? ' df-games-grid--lobby' : ''}`}
          role="list"
          aria-label={`${tabLabel(activeTab)} inside Dragon Fury`}
        >
          {loading && visibleGames.length === 0
            ? Array.from({ length: 12 }, (_, i) => (
                <div
                  key={`sk-${i}`}
                  className={`df-game-card df-game-card--skel${lobbyMode ? ' df-game-card--lobby' : ''}`}
                  aria-hidden
                />
              ))
            : visibleGames.map((game, index) => {
                const catId = gameCategoryId(game, categoryList);
                const hot = !lobbyMode && index < Math.min(6, cols);
                return lobbyMode ? (
                  <article
                    key={game.id || `${game.title}-${index}`}
                    className="df-game-card-wrap"
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="df-game-card df-game-card--lobby"
                      aria-label={`Play ${game.title}`}
                      disabled={playingGameId === game.id}
                      onClick={() => handleCardPlay(game)}
                    >
                      <img
                        className="df-game-card__logo"
                        src={game.image}
                        alt={game.title}
                        width={220}
                        height={220}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="df-game-card__name df-game-card__name--overlay">
                        {game.title}
                      </span>
                    </button>
                    <GameFavoriteButton
                      id={slotFavoriteId(game)}
                      name={game.title}
                      className="df-game-card__fav"
                    />
                  </article>
                ) : (
                  <button
                    key={game.id || `${game.title}-${index}`}
                    type="button"
                    className={`df-game-card${hot ? ' df-game-card--hot' : ''}`}
                    role="listitem"
                    aria-label={`Play ${game.title}`}
                    disabled={playingGameId === game.id}
                    onClick={() => handleCardPlay(game)}
                  >
                    <span className={`df-game-card__tag df-game-card__tag--${catId}`}>
                      {tabLabel(catId)}
                    </span>
                    {hot ? (
                      <span className="df-game-card__hot" aria-label="Hot game">
                        HOT
                      </span>
                    ) : null}
                    <img
                      className="df-game-card__logo"
                      src={game.image}
                      alt={game.title}
                      width={220}
                      height={220}
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="df-game-card__name">{game.title}</span>
                  </button>
                );
              })}
        </div>
      </div>

      {remaining > 0 ? (
        <div className="df-games-more df-games-more--toggle">
          <button
            className="df-games-view-more"
            type="button"
            onClick={loadMore}
          >
            {lobbyMode ? 'Load More Games' : 'VIEW MORE'}
          </button>
        </div>
      ) : null}

      {showGuestSpinModal ? (
        <GuestSlotSpinWheelModal open={spinModalOpen} onClose={() => setSpinModalOpen(false)} />
      ) : null}
    </section>
  );
}
