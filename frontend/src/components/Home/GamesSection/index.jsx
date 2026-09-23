import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue, Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { STORE_CODE } from '../../../config/site';
import { buildGuestPlatformGames } from '../../../config/featuredPlatformGames';
import * as gamesApi from '../../../api/games';
import { GameCard } from '../../Games/GameCard';
import { GamesGridSkeleton } from '../GamesGridSkeleton';
import { SlotGamesSearchBar } from '../../SlotGames/SlotGamesSearchBar';
import { LobbyPlatformTile } from '../LobbyPlatformTile';
import { isGoldenDragonGameName, isFirekirinGameName, isIntegerScAmount, GAME_DEPOSIT_AMOUNT_ERROR, GAME_WITHDRAW_AMOUNT_ERROR } from '../../../utils/goldenDragon';
import { isManualModeGame } from '../../../utils/gameDisplay';
import {
  formatRedeemMinimumBalanceAlertMessage,
  shouldToastGameWalletTransferMessage,
} from '../../../utils/gameWalletTransferErrors';
import { dedupeGamesForListing } from '../../../utils/dedupeGames';
import {
  normalizePlatformSearch,
  searchPlatformGames,
} from '../../../utils/platformGameSearch';
import { DepositGameModal } from './DepositGameModal';
import { WithdrawGameModal } from './WithdrawGameModal';
import { GuestPlatformsGrid } from './GuestPlatformsGrid';
import { DepositRequiredModal } from '../../../components/Games/DepositRequiredModal';
import { WithdrawPromptModal } from '../../../components/Games/WithdrawPromptModal';
import { useDepositRequiredGate } from '../../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../../utils/depositRequired';
import { HomeCasinoCategorySlider } from '../HomeCasinoCategorySlider';
import { FirekirinExclusiveSlider, FirekirinExclusiveOverlays } from '../FirekirinExclusiveSlider';
import { useFirekirinExclusiveGames } from '../../../hooks/useFirekirinExclusiveGames';
import {
  buildLobbyMixRows,
  useLobbyPlatformChunkSize,
  useDragonFuryHomeCasinoCategories,
} from '../homeCasinoLobbyMix';
import { SlotGamesCatalogGrid } from '../SlotGamesCatalogGrid';
import {
  appendBonaToSlotCategories,
  buildOrionstarSlotCategories,
} from '../../../utils/gitslotparkLandingGames';
import {
  getAllCachedProviderSlotGames,
} from '../../../utils/dashboardSlotGamesCache';
import { prefetchLobbySlotGames } from '../DashboardSlotGamesSection';
import { useLaunchDashboardSlotGame } from '../../../hooks/useLaunchDashboardSlotGame';
import { fetchEnabledSlotProviders } from '../../../hooks/useEnabledSlotProviders';

const LOBBY_FILTERS = [
  { id: 'registered', label: '', icon: '/df-online/club-icons/heart.png', ariaLabel: 'My Games' },
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web', icon: '/df-online/club-icons/gamepad.png' },
  { id: 'slots', label: 'Slots', icon: '/df-online/club-icons/slots-777.png' },
  { id: 'live-casino', label: 'Live', icon: '/df-online/club-icons/dice.webp' },
];

const CASINO_FILTER_IDS = new Set(['slots', 'live-casino']);
const PLATFORM_FILTER_IDS = new Set(['all', 'web', 'registered']);

export function GamesSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshBalance: refreshScWallet, balanceSc, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const {
    requireDeposit,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
  } = useDepositRequiredGate({ enabled: isAuthenticated });
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [casinoCatalogGames, setCasinoCatalogGames] = useState(() => getAllCachedProviderSlotGames());
  const [casinoCatalogCategories, setCasinoCatalogCategories] = useState([]);
  const [casinoLoading, setCasinoLoading] = useState(false);
  const {
    handlePlayGame: handleCasinoPlay,
    launchingGameId: casinoLaunchingId,
    depositRequiredModalOpen: casinoDepositOpen,
    closeDepositRequiredModal: closeCasinoDeposit,
    activationBonusType: casinoActivationBonus,
  } = useLaunchDashboardSlotGame();
  const [activeGame, setActiveGame] = useState(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeGameBalance, setActiveGameBalance] = useState(null);
  const [activeGameWinnings, setActiveGameWinnings] = useState(null);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState({ gameId: null, key: 0 });
  const [redeemError, setRedeemError] = useState(null);
  const [topupError, setTopupError] = useState(null);
  const [withdrawPromptOpen, setWithdrawPromptOpen] = useState(false);
  const [redeemedAmount, setRedeemedAmount] = useState(null);
  const gamesLoadedOnceRef = useRef(false);
  const gamesFetchInFlightRef = useRef(false);

  const loadGames = useCallback(async () => {
    if (gamesFetchInFlightRef.current) return;
    gamesFetchInFlightRef.current = true;

    const isInitialLoad = !gamesLoadedOnceRef.current;
    if (isInitialLoad) setGamesLoading(true);

    try {
      const res = await gamesApi.listGames({ store_code: STORE_CODE });
      const list = res?.games ?? [];
      const sorted = dedupeGamesForListing(
        [...list].sort((a, b) => {
          const aReg = a.has_account ? 1 : 0;
          const bReg = b.has_account ? 1 : 0;
          if (bReg !== aReg) return bReg - aReg;
          return (a.id || 0) - (b.id || 0);
        })
      );
      setGames(sorted);
      gamesLoadedOnceRef.current = true;
    } catch {
      if (isInitialLoad) setGames([]);
    } finally {
      gamesFetchInFlightRef.current = false;
      if (isInitialLoad) setGamesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setGamesLoading(false);
      return undefined;
    }
    loadGames();
    return undefined;
  }, [isAuthenticated, loadGames]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    setCasinoLoading(true);

    const refreshCasino = (providerFlags = {}) => {
      const all = getAllCachedProviderSlotGames();
      if (cancelled) return;
      setCasinoCatalogGames(all);
      setCasinoCatalogCategories(
        appendBonaToSlotCategories(buildOrionstarSlotCategories(all, providerFlags), all)
      );
    };

    fetchEnabledSlotProviders()
      .then((providers) => {
        if (cancelled) return null;
        const flags = {
          gitslotpark: Boolean(providers?.gitslotpark),
          onegamehub: Boolean(providers?.onegamehub),
        };
        refreshCasino(flags);
        return flags;
      })
      .then((flags) => {
        if (cancelled || !flags) return;
        return prefetchLobbySlotGames().then(() => {
          if (!cancelled) refreshCasino(flags);
        });
      })
      .finally(() => {
        if (!cancelled) setCasinoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const onReload = () => {
      loadGames();
    };
    window.addEventListener('games:reload', onReload);
    return () => window.removeEventListener('games:reload', onReload);
  }, [loadGames]);

  // Always land on the "All Games" tab when navigating to the home games view
  // (e.g. tapping Home/Platform in the mobile bottom bar) — the section stays
  // mounted across those in-page navigations, so reset the filter on each.
  useEffect(() => {
    setFilter('all');
    setSearch('');
  }, [location.key]);

  const clearSearch = useCallback(() => setSearch(''), []);

  // During focus_game onboarding, keep "All Games" visible so the next unregistered game can be highlighted.
  useEffect(() => {
    const syncFilterForOnboarding = () => {
      try {
        if (
          localStorage.getItem('onboarding_pending') === 'true' &&
          localStorage.getItem('onboarding_step') === 'focus_game'
        ) {
          setFilter('all');
        }
      } catch {
        /* ignore */
      }
    };
    syncFilterForOnboarding();
    window.addEventListener('onboarding:updated', syncFilterForOnboarding);
    window.addEventListener('onboarding:start', syncFilterForOnboarding);
    return () => {
      window.removeEventListener('onboarding:updated', syncFilterForOnboarding);
      window.removeEventListener('onboarding:start', syncFilterForOnboarding);
    };
  }, []);

  useEffect(() => {
    const closeGameModals = () => {
      setDepositModalOpen(false);
      setWithdrawModalOpen(false);
      setTopupError(null);
      setRedeemError(null);
    };
    window.addEventListener('onboarding:close-game-modals', closeGameModals);
    return () => window.removeEventListener('onboarding:close-game-modals', closeGameModals);
  }, []);

  const INSUFFICIENT_BALANCE_PATTERNS = /insufficient|wallet balance|not have.*balance/i;

  function isOnboardingPending() {
    try {
      return localStorage.getItem('onboarding_pending') === 'true';
    } catch {
      return false;
    }
  }

  function notifyOnboardingGameTransferError() {
    if (!isOnboardingPending()) return;
    try {
      window.dispatchEvent(new CustomEvent('onboarding:game-transfer-error'));
    } catch {
      /* ignore */
    }
  }

  function notifyOnboardingTopupAmountEntered(value) {
    if (!isOnboardingPending()) return;
    const n = parseInt(String(value).trim(), 10);
    if (!isIntegerScAmount(n)) return;
    try {
      window.dispatchEvent(new CustomEvent('onboarding:topup-amount-entered'));
    } catch {
      /* ignore */
    }
  }

  function notifyOnboardingWithdrawAmountEntered(value) {
    if (!isOnboardingPending()) return;
    const n = parseInt(String(value).trim(), 10);
    if (!isIntegerScAmount(n)) return;
    try {
      window.dispatchEvent(new CustomEvent('onboarding:withdraw-amount-entered'));
    } catch {
      /* ignore */
    }
  }

  const tabFilteredGames = useMemo(() => {
    /* Auth lobby platforms: curated static list (live dragonfury.online/lobby). */
    const platformList = buildGuestPlatformGames(games);
    if (filter === 'registered') {
      return platformList.filter((g) => g.has_account && g.account_status === 'approved');
    }
    if (filter === 'web' || filter === 'all') return platformList;
    return platformList;
  }, [games, filter]);

  const searchQuery = normalizePlatformSearch(deferredSearch);
  const isSearchActive =
    isAuthenticated && searchQuery.length > 0 && PLATFORM_FILTER_IDS.has(filter);

  const filteredGames = useMemo(
    () => (isSearchActive ? searchPlatformGames(tabFilteredGames, deferredSearch) : tabFilteredGames),
    [tabFilteredGames, deferredSearch, isSearchActive]
  );

  const guestPlatformGames = useMemo(() => buildGuestPlatformGames(games), [games]);

  const gamesGridClassName = `dash-games-grid${filter === 'all' || filter === 'web' ? ' dash-games-grid--3' : ''}`;
  const searchResultCount = filteredGames.length;
  const searchEmptyQueryLabel = normalizePlatformSearch(search) || searchQuery;
  const casinoCategories = useDragonFuryHomeCasinoCategories({
    enabled: isAuthenticated,
  });
  const platformChunkSize = useLobbyPlatformChunkSize();
  /* Platforms + full casino catalog are stacked below; skip interleaved mix rows. */
  const mixCasinoCategories = false;

  const lobbyFilterItems = useMemo(() => LOBBY_FILTERS, []);

  const isCasinoFilterEffective = CASINO_FILTER_IDS.has(filter);
  const showCasinoCatalog =
    isAuthenticated && (isCasinoFilterEffective || filter === 'all');
  const catalogInitialTab =
    filter === 'live-casino' ? 'live-casino' : filter === 'slots' ? 'slots' : 'all';
  const firekirinExclusive = useFirekirinExclusiveGames({ enabled: isAuthenticated });
  const lobbyMixRows = useMemo(
    () =>
      mixCasinoCategories
        ? buildLobbyMixRows(filteredGames, casinoCategories, platformChunkSize, {
            insertAfter: firekirinExclusive.hasGames
              ? {
                  match: (game) =>
                    isFirekirinGameName(game?.name) || isFirekirinGameName(game?.gameKey),
                  category: { id: 'firekirin-exclusive', label: 'Firekirin Exclusive' },
                  flushImmediately: platformChunkSize <= 2,
                }
              : null,
          })
        : [],
    [
      mixCasinoCategories,
      filteredGames,
      casinoCategories,
      platformChunkSize,
      firekirinExclusive.hasGames,
    ]
  );

  function renderFirekirinExclusiveRail() {
    return (
      <FirekirinExclusiveSlider
        games={firekirinExclusive.games}
        onPlay={firekirinExclusive.handlePlay}
        playingGameId={firekirinExclusive.launchingGameId}
      />
    );
  }

  function renderPlatformGameCard(game, i) {
    if (isAuthenticated) {
      return (
        <LobbyPlatformTile
          key={game.id ?? `game-${i}`}
          game={game}
          onRegistered={loadGames}
          onOpenDeposit={handleOpenDeposit}
          onOpenWithdraw={handleOpenWithdraw}
          onOpenPlay={handleOpenPlay}
        />
      );
    }
    return (
      <div
        key={game.id ?? `game-${i}`}
        className={`dash-game-wrap dash-animate-in dash-delay-${Math.min((i % 6) + 1, 6)}`}
      >
        <GameCard
          game={game}
          isAuthenticated={isAuthenticated}
          onRegistered={loadGames}
          onOpenDeposit={handleOpenDeposit}
          onOpenWithdraw={handleOpenWithdraw}
          onOpenPlay={handleOpenPlay}
          balanceRefreshTrigger={balanceRefreshTrigger.gameId === game.id ? balanceRefreshTrigger.key : 0}
        />
      </div>
    );
  }

  async function refreshActiveGameBalance() {
    if (!activeGame) return;
    if (isManualModeGame(activeGame)) {
      setActiveGameBalance(null);
      setActiveGameWinnings(null);
      return;
    }
    try {
      const res = await gamesApi.getGameBalance(activeGame.id);
      const balance = res?.balance;
      const winnings = res?.winnings != null ? Number(res.winnings) : null;
      setActiveGameBalance(balance);
      setActiveGameWinnings(winnings);
      if (withdrawModalOpen && isOnboardingPending()) {
        const gd = isGoldenDragonGameName(activeGame);
        const redeemable = gd
          ? (winnings != null ? Number(winnings) : null)
          : (balance != null ? Number(balance) : null);
        try {
          window.dispatchEvent(
            new CustomEvent('onboarding:withdraw-balance-ready', {
              detail: { redeemableBalance: redeemable },
            })
          );
        } catch {
          /* ignore */
        }
      }
    } catch {
      setActiveGameBalance(null);
      setActiveGameWinnings(null);
      if (withdrawModalOpen && isOnboardingPending()) {
        try {
          window.dispatchEvent(
            new CustomEvent('onboarding:withdraw-balance-ready', {
              detail: { redeemableBalance: null },
            })
          );
        } catch {
          /* ignore */
        }
      }
    }
  }

  useEffect(() => {
    if (withdrawModalOpen && activeGame) refreshActiveGameBalance();
  }, [withdrawModalOpen, activeGame]);

  // Tutorial Deposit / Buy SC: open purchase modal when package deposit is still required.
  useEffect(() => {
    const onRequestDepositPackages = () => {
      requireDeposit(() => {
        navigate('/deposit');
      });
    };
    window.addEventListener('onboarding:request-deposit-packages', onRequestDepositPackages);
    return () => {
      window.removeEventListener('onboarding:request-deposit-packages', onRequestDepositPackages);
    };
  }, [requireDeposit, navigate]);

  function handleOpenDeposit(game) {
    requireDeposit(() => {
      setActiveGame(game);
      setTopupAmount('');
      setTopupError(null);
      setDepositModalOpen(true);
      try {
        window.dispatchEvent(
          new CustomEvent('onboarding:topup-open', {
            detail: { balanceSc: balanceSc != null ? Number(balanceSc) : 0 },
          })
        );
      } catch {
        /* ignore */
      }
    });
  }

  function handleOpenPlay(game) {
    requireDeposit(() => {
      const url = game?.platformGameUrl ? String(game.platformGameUrl).trim() : '';
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  function handleOpenWithdraw(game) {
    requireDeposit(() => {
      setActiveGame(game);
      setWithdrawAmount('');
      setRedeemError(null);
      setActiveGameBalance(null);
      setActiveGameWinnings(null);
      setWithdrawModalOpen(true);
      try {
        window.dispatchEvent(new CustomEvent('onboarding:withdraw-open'));
      } catch {
        /* ignore */
      }
    });
  }

  async function handleTopup() {
    if (!activeGame) return;
    const n = parseInt(String(topupAmount).trim(), 10);
    if (!isIntegerScAmount(n)) {
      setTopupError(GAME_DEPOSIT_AMOUNT_ERROR);
      notifyOnboardingGameTransferError();
      return;
    }
    const amount = n;
    if (balanceSc != null && amount > balanceSc) {
      setTopupError(`Your wallet balance is insufficient. Please enter an amount up to ${balanceSc.toFixed(2)} SC.`);
      notifyOnboardingGameTransferError();
      return;
    }
    if (activeGame.minDepositLimit > 0 && amount < activeGame.minDepositLimit) {
      setTopupError(`The minimum deposit amount for this game is ${activeGame.minDepositLimit} SC.`);
      notifyOnboardingGameTransferError();
      return;
    }
    if (activeGame.maxDepositLimit > 0 && amount > activeGame.maxDepositLimit) {
      setTopupError(`The maximum deposit amount for this game is ${activeGame.maxDepositLimit} SC.`);
      notifyOnboardingGameTransferError();
      return;
    }
    setTopupError(null);
    setSubmitting(true);
    try {
      const res = await gamesApi.gameTopup(activeGame.id, amount);
      toast.success(res?.message_extra || res?.message || 'Recharge successful');
      setTopupAmount('');
      setDepositModalOpen(false);
      await refreshScWallet?.();
      setBalanceRefreshTrigger((prev) => ({ gameId: activeGame.id, key: prev.key + 1 }));
      loadGames();
      if (isOnboardingPending()) {
        try {
          window.dispatchEvent(new CustomEvent('onboarding:topup-success'));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      const msg = e.message || '';
      if (isDepositRequiredError(e)) {
        setDepositModalOpen(false);
        openDepositRequiredModal();
      } else if (INSUFFICIENT_BALANCE_PATTERNS.test(msg)) {
        setTopupError('You don\'t have enough balance in your wallet to complete this recharge.');
        notifyOnboardingGameTransferError();
      } else if (shouldToastGameWalletTransferMessage(e)) {
        toast.error(msg);
        notifyOnboardingGameTransferError();
      }
      // No red toast for other topup errors (game/bot APIs; automation handled on our side)
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!activeGame) return;
    const n = parseInt(String(withdrawAmount).trim(), 10);
    if (!isIntegerScAmount(n)) {
      setRedeemError(GAME_WITHDRAW_AMOUNT_ERROR);
      notifyOnboardingGameTransferError();
      return;
    }
    const amount = n;
    const gd = isGoldenDragonGameName(activeGame);
    const redeemableBalance = gd
      ? (activeGameWinnings != null ? Number(activeGameWinnings) : null)
      : (activeGameBalance != null ? Number(activeGameBalance) : null);
    if (!isManualModeGame(activeGame) && redeemableBalance != null && amount > redeemableBalance) {
      setRedeemError(
        `Your game balance is insufficient. Please enter an amount up to ${Number(redeemableBalance).toFixed(2)} SC.`
      );
      notifyOnboardingGameTransferError();
      return;
    }
    if (activeGame.minWithdrawalLimit > 0 && amount < activeGame.minWithdrawalLimit) {
      setRedeemError(`The minimum redeem amount for this game is ${activeGame.minWithdrawalLimit} SC.`);
      notifyOnboardingGameTransferError();
      return;
    }
    if (activeGame.maxWithdrawalLimit > 0 && amount > activeGame.maxWithdrawalLimit) {
      setRedeemError(`The maximum redeem amount for this game is ${activeGame.maxWithdrawalLimit} SC.`);
      notifyOnboardingGameTransferError();
      return;
    }
    setRedeemError(null);
    setSubmitting(true);
    try {
      const res = await gamesApi.gameRedeem(activeGame.id, amount);
      toast.success(res?.message_extra || res?.message || 'Redeem successful! SC added to your wallet.');
      setWithdrawAmount('');
      setWithdrawModalOpen(false);
      await refreshScWallet?.();
      setBalanceRefreshTrigger((prev) => ({ gameId: activeGame.id, key: prev.key + 1 }));
      loadGames();
      // Auto (bot online) redeem lands SC in the wallet immediately — offer next steps.
      // Skip during onboarding (guided flow drives its own next step).
      if (!res?.pending && !isOnboardingPending()) {
        setRedeemedAmount(amount);
        setWithdrawPromptOpen(true);
      }
      if (isOnboardingPending()) {
        window.setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('onboarding:withdraw-success'));
          } catch {
            /* ignore */
          }
        }, 0);
      }
    } catch (e) {
      if (isDepositRequiredError(e)) {
        setWithdrawModalOpen(false);
        openDepositRequiredModal();
      } else if (shouldToastGameWalletTransferMessage(e)) {
        const alertMessage =
          formatRedeemMinimumBalanceAlertMessage(e.message) || 'Request could not be completed.';
        toast.error(alertMessage);
        notifyOnboardingGameTransferError();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="games" className={`dash-games-section dash-animate-in dash-delay-3${!isAuthenticated ? ' dash-games-section--guest' : ' dash-games-section--auth'}`}>
      {!isAuthenticated ? (
        <div className="dash-section-head">
          <h2 className="dash-section-title dash-platforms-title">
            Top <span className="dash-platforms-title-accent">Game</span> Platforms
          </h2>
        </div>
      ) : null}

      {isAuthenticated ? (
        <div className="dash-platform-search-wrap lobby-search">
          <SlotGamesSearchBar
            value={search}
            onChange={setSearch}
            onClear={clearSearch}
            resultCount={isSearchActive ? searchResultCount : null}
            disabled={gamesLoading && games.length === 0}
            placeholder="Search games"
            ariaLabel="Search games"
            resultNoun="game"
            enableSticky={false}
          />
        </div>
      ) : null}

      {isAuthenticated ? (
        <div className="df-lobby-filter-bar" role="tablist" aria-label="Lobby filters">
          {lobbyFilterItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-label={item.ariaLabel || item.label || item.id}
              aria-selected={filter === item.id}
              className={`df-lobby-filter-chip${filter === item.id ? ' df-lobby-filter-chip--active' : ''}${item.id === 'registered' ? ' df-lobby-filter-chip--fav' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.icon ? (
                <img
                  className="df-lobby-filter-chip__glyph"
                  src={item.icon}
                  alt=""
                  width={64}
                  height={50}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
              {item.label || null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="dash-games-panel">
      {isCasinoFilterEffective ? (
        <SlotGamesCatalogGrid
          games={casinoCatalogGames}
          categories={casinoCatalogCategories.length ? casinoCatalogCategories : casinoCategories}
          loading={casinoLoading}
          onPlay={handleCasinoPlay}
          playingGameId={casinoLaunchingId}
          embedded
          hideIntro
          showCategoryTabs
          lobbyMode
          initialTab={catalogInitialTab}
        />
      ) : gamesLoading && games.length === 0 && isAuthenticated ? (
        <GamesGridSkeleton threeColumns={filter === 'all' || filter === 'web'} />
      ) : isSearchActive && searchResultCount === 0 ? (
        <div className="dash-games-empty dash-slot-search-empty">
          <span className="dash-games-empty-icon" aria-hidden>🔍</span>
          <p className="dash-games-empty-title">No platforms found</p>
          <p className="dash-games-empty-sub">
            Nothing matched “{searchEmptyQueryLabel}”. Try another name
            {filter === 'registered' ? ', or browse All Games' : ''}.
          </p>
          <div className="dash-platform-search-empty-actions">
            <button type="button" className="dash-btn-outline mt-3" onClick={clearSearch}>
              Clear search
            </button>
            {filter === 'registered' ? (
              <button
                type="button"
                className="dash-btn-outline mt-3"
                onClick={() => setFilter('all')}
              >
                Browse All Games
              </button>
            ) : null}
          </div>
        </div>
      ) : filteredGames.length === 0 && isAuthenticated ? (
        <div className="dash-games-empty">
          <span className="dash-games-empty-icon" aria-hidden>🎮</span>
          <p className="dash-games-empty-title">
            {filter === 'registered' ? 'No games yet' : 'No games available'}
          </p>
          <p className="dash-games-empty-sub">
            {filter === 'registered'
              ? 'Register a game from All Games to see it here.'
              : 'Check back soon — new titles are added regularly.'}
          </p>
          {filter === 'registered' && (
            <button type="button" className="dash-btn-outline mt-3" onClick={() => setFilter('all')}>
              Browse All Games
            </button>
          )}
        </div>
      ) : !isAuthenticated ? (
        <GuestPlatformsGrid games={guestPlatformGames} />
      ) : (
        mixCasinoCategories ? (
          <div className="dash-lobby-mix" aria-label="Platform games and casino categories">
            {lobbyMixRows.map((row, rowIndex) => (
              <div
                key={`mix-row-${rowIndex}`}
                className={`dash-lobby-mix-row${row.category ? '' : ' dash-lobby-mix-row--games-only'}`}
              >
                <div className="dash-lobby-mix-games">
                  {row.games.map((game, gameIndex) =>
                    renderPlatformGameCard(game, (row.gameOffset || 0) + gameIndex)
                  )}
                </div>
                {row.category?.id === 'firekirin-exclusive'
                  ? renderFirekirinExclusiveRail()
                  : row.category
                    ? <HomeCasinoCategorySlider category={row.category} />
                    : null}
              </div>
            ))}
          </div>
        ) : (
        <div className="df-lobby-platforms" aria-label="Platform games">
          {filteredGames.map((game, i) => renderPlatformGameCard(game, i))}
        </div>
        )
      )}

      {showCasinoCatalog && !isCasinoFilterEffective ? (
        <div className="df-lobby-slots-block">
          <h3 className="df-lobby-slots-title">DragonFury Slots</h3>
          <SlotGamesCatalogGrid
            games={casinoCatalogGames}
            categories={casinoCatalogCategories.length ? casinoCatalogCategories : casinoCategories}
            loading={casinoLoading}
            onPlay={handleCasinoPlay}
            playingGameId={casinoLaunchingId}
            embedded
            hideIntro
            showCategoryTabs={false}
            lobbyMode
            initialTab="slots"
          />
        </div>
      ) : null}
      </div>

      <DepositGameModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        game={activeGame}
        balanceSc={balanceSc}
        amount={topupAmount}
        onAmountChange={(val) => {
          setTopupAmount(val);
          setTopupError(null);
          notifyOnboardingTopupAmountEntered(val);
        }}
        onSubmit={handleTopup}
        submitting={submitting}
        errorMessage={topupError}
      />
      <WithdrawGameModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        game={activeGame}
        gameBalance={activeGameBalance}
        winnings={activeGameWinnings}
        redeemableBalance={
          isGoldenDragonGameName(activeGame)
            ? (activeGameWinnings != null ? Number(activeGameWinnings) : null)
            : (activeGameBalance != null ? Number(activeGameBalance) : null)
        }
        amount={withdrawAmount}
        onAmountChange={(val) => {
          setWithdrawAmount(val);
          setRedeemError(null);
          notifyOnboardingWithdrawAmountEntered(val);
        }}
        onSubmit={handleWithdraw}
        submitting={submitting}
        errorMessage={redeemError}
      />
      <DepositRequiredModal
        open={depositRequiredModalOpen || casinoDepositOpen}
        onClose={() => {
          closeDepositRequiredModal();
          closeCasinoDeposit();
        }}
        activationBonusType={activationBonusType || casinoActivationBonus}
      />
      <FirekirinExclusiveOverlays
        createPrompt={firekirinExclusive.createPrompt}
        creatingAccount={firekirinExclusive.creatingAccount}
        onCreateAccount={firekirinExclusive.handleCreateAccount}
        onCloseCreatePrompt={firekirinExclusive.closeCreatePrompt}
        depositRequiredModalOpen={firekirinExclusive.depositRequiredModalOpen}
        closeDepositRequiredModal={firekirinExclusive.closeDepositRequiredModal}
        activationBonusType={firekirinExclusive.activationBonusType}
      />
      <WithdrawPromptModal
        open={withdrawPromptOpen}
        onOpenChange={setWithdrawPromptOpen}
        amount={redeemedAmount}
        onConfirm={() => {
          setWithdrawPromptOpen(false);
          navigate('/withdraw');
        }}
      />
    </section>
  );
}
