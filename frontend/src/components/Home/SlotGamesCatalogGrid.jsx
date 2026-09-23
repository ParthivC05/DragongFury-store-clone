import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GuestSlotSpinWheelModal } from '../SpinWheel/GuestSlotSpinWheelModal';
import { canGuestLandingSpin } from '../SpinWheel/guestLandingSpinCooldown';
import { useGuestLandingScrollCount, isWelcomeLandingBlocked } from '../../hooks/useGuestLandingScrollCount';

const PREVIEW_ROWS = 3;
const SPIN_MODAL_SCROLL = 3;
const GUEST_SLOTS_SPIN_MODAL_KEY = 'guest_slots_spin_modal_shown';

const TAB_ORDER = ['all', 'slots', 'fishing', 'table-games'];
const FALLBACK_TABS = ['others', 'live-casino'];

const TABLE_TITLE_RE =
  /\b(poker|blackjack|roulette|baccarat|craps|sic[\s-]?bo|teen[\s-]?patti|andar[\s-]?bahar|hold'?em|pai[\s-]?gow|casino war|three card|video poker)\b/i;

const TAB_ICONS = {
  slots: '/df-online/club-icons/slots-777.webp',
  fishing: '/df-online/club-icons/fish.webp',
  'table-games': '/df-online/club-icons/cards.webp',
  'live-casino': '/df-online/club-icons/cards.webp',
};

const TAB_LABELS = {
  all: 'All',
  slots: 'Slots',
  fishing: 'Fishing',
  'table-games': 'Poker',
  'live-casino': 'Live',
  others: 'Other',
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
  others: new Set([
    'others',
    'bingo',
    'shooting',
    'crash-game',
    'instant-win',
    'keno',
    'scratch-cards',
    'lottery',
    'plinko',
    'casual-games',
    'zesus',
    'olympus',
    'candy',
    'animal',
    'buffalo-blast',
  ]),
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
  if (tabId === 'all') return allGames;
  const fromCats = gamesFromSources(tabId, categories);
  if (tabId === 'table-games') {
    return uniqueGames([...fromCats, ...(allGames || []).filter(isTableLikeGame)]);
  }
  return fromCats;
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
 * Guest Instant Casino — live Games Included layout, API catalog.
 */
export function SlotGamesCatalogGrid({
  games,
  categories = [],
  onPlay,
  playingGameId,
  loading = false,
  guestSpinModal = false,
}) {
  const gridRef = useRef(null);
  const [activeTab, setActiveTab] = useState('all');
  const [expanded, setExpanded] = useState(false);
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

  const tabCounts = useMemo(() => {
    const counts = { all: allGames.length };
    for (const id of [...TAB_ORDER, ...FALLBACK_TABS]) {
      if (id === 'all') continue;
      counts[id] = gamesForTab(id, categoryList, allGames).length;
    }
    return counts;
  }, [allGames, categoryList]);

  const tabs = useMemo(() => {
    const next = TAB_ORDER.filter((id) => id === 'all' || (tabCounts[id] || 0) > 0);
    if (next.length < 4) {
      const extra = FALLBACK_TABS.find((id) => (tabCounts[id] || 0) > 0);
      if (extra) next.push(extra);
    }
    return next;
  }, [tabCounts]);

  const filteredGames = useMemo(
    () => gamesForTab(activeTab, categoryList, allGames),
    [activeTab, allGames, categoryList]
  );

  const previewCount = cols * PREVIEW_ROWS;
  const visibleGames = expanded ? filteredGames : filteredGames.slice(0, previewCount);
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
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab('all');
      setExpanded(false);
    }
  }, [activeTab, tabs]);

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
    <section className="df-games-included" aria-labelledby="df-games-title">
      <p className="df-games-eyebrow">All in one game</p>
      <h2 className="df-games-title" id="df-games-title">
        GAMES INCLUDED
      </h2>
      <p className="df-games-sub">
        One account unlocks <strong>{totalCount || 'these'} titles</strong> — slots, fishing and table
        games. Every one of them is inside.
      </p>

      {tabs.length > 1 ? (
        <div className="df-games-tabs" role="tablist" aria-label="Game categories">
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
          className="df-games-grid df-games-grid--dense"
          role="list"
          aria-label={`${tabLabel(activeTab)} inside Dragon Fury`}
        >
          {loading && visibleGames.length === 0
            ? Array.from({ length: 12 }, (_, i) => (
                <div key={`sk-${i}`} className="df-game-card df-game-card--skel" aria-hidden />
              ))
            : visibleGames.map((game, index) => {
                const catId = gameCategoryId(game, categoryList);
                const hot = !expanded && index < Math.min(6, cols);
                return (
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

      {remaining > 0 || expanded ? (
        <div className="df-games-more df-games-more--toggle">
          <button
            className="df-games-view-all"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'SHOW LESS' : `VIEW ALL (${remaining} MORE)`}
          </button>
        </div>
      ) : null}

      {showGuestSpinModal ? (
        <GuestSlotSpinWheelModal open={spinModalOpen} onClose={() => setSpinModalOpen(false)} />
      ) : null}
    </section>
  );
}
