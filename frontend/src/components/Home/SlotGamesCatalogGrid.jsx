import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GuestSlotSpinWheelModal } from '../SpinWheel/GuestSlotSpinWheelModal';
import { canGuestLandingSpin } from '../SpinWheel/guestLandingSpinCooldown';
import { useGuestLandingScrollCount, isWelcomeLandingBlocked } from '../../hooks/useGuestLandingScrollCount';
import { SlotGamesCarousel } from '../SlotGames/SlotGamesCarousel';
import { scrollToSectionById } from '../../utils/scrollToGames';
import { site } from '../../config/site';

const SPIN_MODAL_SCROLL = 3;

export const SLOT_CATALOG_ROWS = 3;
export const SLOT_CATALOG_COLS = 6;
export const SLOT_CATALOG_GAME_COUNT = SLOT_CATALOG_ROWS * SLOT_CATALOG_COLS;
export const SLOT_CATALOG_MOBILE_GAME_COUNT = 6;

const VISIBLE_PER_CATEGORY = 12;
const GUEST_SLOTS_SPIN_MODAL_KEY = 'guest_slots_spin_modal_shown';

const HIDDEN_CHIP_IDS = new Set(['recently-played', 'top-fishing', 'top-games']);

const CHIP_LABELS = {
  all: 'All Games',
  slots: '🎰 Slots',
  fishing: '🐟 Fishing',
  'live-casino': '🃏 Live Casino',
  'instant-win': '⚡ Instant Win',
  'crash-game': '🚀 Crash',
  'table-games': '♠️ Table',
  keno: '🔢 Keno',
  bingo: 'Bingo',
  lottery: 'Lottery',
  plinko: 'Plinko',
  'video-poker': 'Video Poker',
  'scratch-cards': 'Scratch',
  shooting: 'Shooting',
  'casual-games': 'Casual',
  'new-games': 'New',
  'trending-games': 'Trending',
  others: 'Other',
};

function chipLabel(categoryId, category) {
  const id = String(categoryId || category?.id || '');
  return CHIP_LABELS[id] || category?.label || id;
}

/**
 * Guest Instant Casino — bridge banner, category chips, inspo game grid.
 */
export function SlotGamesCatalogGrid({
  games,
  categories = [],
  onPlay,
  playingGameId,
  loading = false,
  guestSpinModal = false,
}) {
  const sectionRef = useRef(null);
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [gridAnimKey, setGridAnimKey] = useState(0);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const showGuestSpinModal = guestSpinModal && !isAuthenticated;
  const guestScrollCount = useGuestLandingScrollCount(showGuestSpinModal);
  const platformName = site.platformName || 'Play Juwa';

  const chipCategories = useMemo(
    () =>
      (Array.isArray(categories) ? categories : []).filter(
        (c) => c?.id && !HIDDEN_CHIP_IDS.has(c.id) && (c.games?.length || 0) > 0
      ),
    [categories]
  );

  const filteredGames = useMemo(() => {
    if (activeCategoryId === 'all') {
      return Array.isArray(games) ? games : [];
    }
    const match = chipCategories.find((c) => c.id === activeCategoryId);
    return Array.isArray(match?.games) ? match.games : [];
  }, [activeCategoryId, chipCategories, games]);

  const displayGames = filteredGames.slice(0, VISIBLE_PER_CATEGORY);
  const canShowAll = !loading;

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

  const selectCategory = useCallback((nextId) => {
    if (nextId === activeCategoryId) return;
    setActiveCategoryId(nextId);
    setGridAnimKey((k) => k + 1);
  }, [activeCategoryId]);

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

  if (!loading && (!games || games.length === 0) && chipCategories.length === 0) {
    return null;
  }

  function handleTryCasino(e) {
    e.preventDefault();
    scrollToSectionById('casino', { offset: 12 });
  }

  const gridClass = 'dash-guest-casino-grid';

  return (
    <div className="dash-guest-casino-block">
      <div className="dash-casino-bridge dash-animate-in" id="casino-bridge">
        <span className="dash-casino-bridge-tag">FURY ARCADE</span>
        <div className="dash-casino-bridge-copy">
          <p className="dash-casino-bridge-title">
            Instant casino. <em>Same SC wallet.</em>
          </p>
          <div className="dash-casino-bridge-pts">
            <span>One login — your {platformName} account</span>
            <span>Same SC wallet</span>
            <span>Starts instantly, any device</span>
          </div>
        </div>
        <button type="button" className="dash-casino-bridge-cta" onClick={handleTryCasino}>
          Try Casino ↓
        </button>
      </div>

      <section
        ref={sectionRef}
        id="casino"
        className="dash-slot-catalog-section dash-guest-casino dash-guest-casino--arcade dash-animate-in"
        aria-busy={loading || undefined}
      >
        <div className="dash-guest-casino-head">
          <p className="dash-guest-casino-kick">Instant casino</p>
          <h2 className="dash-guest-casino-title">Tables. Slots. Live. Instant.</h2>
          <p className="dash-guest-casino-lede">
            Poster wall of instant casino — tap a title, play in the browser, same SC wallet.
          </p>
        </div>

        {chipCategories.length > 0 ? (
          <div className="dash-guest-casino-chips" role="tablist" aria-label="Casino game categories">
            <button
              type="button"
              role="tab"
              aria-selected={activeCategoryId === 'all'}
              className={`dash-guest-casino-chip${activeCategoryId === 'all' ? ' is-on' : ''}`}
              onClick={() => selectCategory('all')}
            >
              {CHIP_LABELS.all}
            </button>
            {chipCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategoryId === category.id}
                className={`dash-guest-casino-chip${activeCategoryId === category.id ? ' is-on' : ''}`}
                onClick={() => selectCategory(category.id)}
              >
                {chipLabel(category.id, category)}
              </button>
            ))}
          </div>
        ) : null}

        <div key={`${activeCategoryId}-${gridAnimKey}`} className="dash-guest-casino-grid-stage">
          <SlotGamesCarousel
            label=""
            games={displayGames}
            ariaLabel="Instant casino games"
            loading={loading}
            grid
            gridClassName={gridClass}
            skeletonCount={VISIBLE_PER_CATEGORY}
            onPlay={handleCardPlay}
            playingGameId={playingGameId}
            cardVariant="guest-inspo"
            overlayCta="Enter table"
          />
        </div>

        {canShowAll ? (
          <button
            type="button"
            className="dash-platforms-toggle dash-guest-casino-toggle"
            onClick={goSignup}
          >
            Open full arcade →
          </button>
        ) : null}
      </section>

      {showGuestSpinModal ? (
        <GuestSlotSpinWheelModal open={spinModalOpen} onClose={() => setSpinModalOpen(false)} />
      ) : null}
    </div>
  );
}
