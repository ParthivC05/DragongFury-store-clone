import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as gitslotparkApi from '../../api/gitslotpark';
import * as onegamehubApi from '../../api/onegamehub';
import * as bonaApi from '../../api/bona';
import * as scorpioApi from '../../api/scorpio';
import {
  appendBonaToSlotCategories,
  buildOrionstarSlotCategories,
  dedupeCarouselGames,
  extractGitslotparkGamesList,
  isBlockedOneGameHubBrand,
  mapGitslotparkToCarouselGame,
  mapOneGameHubToCarouselGame,
  mapBonaToCarouselGame,
  mapScorpioToCarouselGame,
  getSlotCategoryLabel,
  getSlotCategoryPath,
  gamesForCasinoLobbyRow,
  normalizeSlotCategoryId,
  prepareDashboardSlotGames,
  resolveLaunchGameId,
  isOneGameHubFishingPlayGame,
} from '../../utils/gitslotparkLandingGames';
import {
  getCachedProviderSlotGames,
  getAllCachedProviderSlotGames,
  setCachedProviderSlotGames,
  clearCachedProviderSlotGames,
} from '../../utils/dashboardSlotGamesCache';
import {
  collectSlotPreviewImageUrls,
  warmSlotGameImages,
} from '../../utils/preloadSlotGameImages';
import {
  buildRecentlyPlayedSlotCategoryFromTransactions,
} from '../../utils/recentlyPlayedSlotGames';
import { getSlotLobbyCategoryMeta, SlotLobbyIcon } from '../SlotGames/slotLobbyMeta';
import { SlotGamesCarousel } from '../SlotGames/SlotGamesCarousel';
import { SlotGamesSearchBar } from '../SlotGames/SlotGamesSearchBar';
import { AppLoader } from '../AppLoader';
import { RecentBigWins } from './RecentBigWins';
import { SlotGamesCatalogGrid } from './SlotGamesCatalogGrid';
import { usePageContentReady } from '../../context/PageReadyContext';
import { DepositRequiredModal } from '../Games/DepositRequiredModal';
import { useDepositRequiredGate } from '../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../utils/depositRequired';
import { useEnabledSlotProviders, fetchEnabledSlotProviders } from '../../hooks/useEnabledSlotProviders';
import { TOP_FISHING_GAMES_COUNT } from '../../config/onegamehubTopFishingGames';
import { SCORPIO_GAMES_SLUG, isScorpioPlayProvider } from '../../config/scorpio';

const PROVIDER_FETCH_TIMEOUT_MS = 12000;
const FIRST_PAINT_TIMEOUT_MS = 6000;
const ONEGAMEHUB_CACHE_KEY = 'onegamehub-v8';
const BONA_CACHE_KEY = 'bona';
const SCORPIO_CACHE_KEY = 'scorpio-v5';
const SEARCH_RESULTS_LIMIT = 36;
const CATEGORY_PAGE_SIZE = 80;
const LOBBY_DESKTOP_GAMES_PER_ROW = 10;
const LOBBY_DESKTOP_ROWS = 2;

function normalizeSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getProviderSearchText(provider) {
  if (provider === 'onegamehub' || provider === '1gamehub') return '1gamehub games';
  if (provider === 'bona') return 'bona games';
  if (isScorpioPlayProvider(provider)) return 'scorpio games';
  const label = gitslotparkApi.getGitslotparkProviderMeta(provider)?.label || '';
  return `${provider} ${label}`.trim().toLowerCase();
}

function rankSearchMatch(game, query) {
  const title = normalizeSearch(game.title);
  const symbol = normalizeSearch(game.symbol);
  const provider = getProviderSearchText(game.provider);

  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (symbol.startsWith(query)) return 2;
  if (title.includes(query)) return 3;
  if (symbol.includes(query)) return 4;
  if (provider.includes(query)) return 5;
  return -1;
}

function searchSlotGames(games, rawQuery) {
  const query = normalizeSearch(rawQuery);
  if (!query) return [];

  const ranked = [];
  for (const game of games) {
    const score = rankSearchMatch(game, query);
    if (score < 0) continue;
    ranked.push({ game, score });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return String(a.game.title || '').localeCompare(String(b.game.title || ''));
  });

  return ranked.map((entry) => entry.game);
}

function withRecentlyPlayedCategory(allGames, categories, recentRows) {
  const recent = buildRecentlyPlayedSlotCategoryFromTransactions(allGames, recentRows);
  const withoutRecent = (categories || []).filter((c) => c.id !== 'recently-played');
  if (!recent) return withoutRecent;
  return [recent, ...withoutRecent];
}

function fetchProviderSlotGames(provider) {
  const cached = getCachedProviderSlotGames(provider);

  return gitslotparkApi
    .getSlotGames(provider)
    .then((res) => {
      const list = extractGitslotparkGamesList(res);
      const mapped = list.map((game) => mapGitslotparkToCarouselGame(game, provider));
      if (mapped.length) {
        setCachedProviderSlotGames(provider, mapped);
      }
      return mapped.length ? mapped : cached || [];
    })
    .catch(() => cached || []);
}

let hubGamesInflight = null;

function applyLobbyGamesToState(
  nextGames,
  applyCategories,
  recentRowsRef,
  setCatalogGames,
  setHasAnySlotsProvider,
  hasSlotProviders,
  setLoading,
  providerFlags = {},
) {
  const loadedCategories = appendBonaToSlotCategories(
    buildOrionstarSlotCategories(nextGames, providerFlags),
    nextGames,
  );
  const shownGames = dedupeCarouselGames(
    loadedCategories.flatMap((category) => category.games || []),
  );
  applyCategories(shownGames, loadedCategories, recentRowsRef.current);
  setCatalogGames(prepareDashboardSlotGames(shownGames));
  setHasAnySlotsProvider(shownGames.length > 0 || hasSlotProviders);
  if (shownGames.length > 0) setLoading(false);
}

async function fetchOneGameHubSlotGames() {
  if (hubGamesInflight) return hubGamesInflight;

  hubGamesInflight = (async () => {
    try {
      const res = await onegamehubApi.getOneGameHubGames();
      if (res?.enabled === false) {
        clearCachedProviderSlotGames(ONEGAMEHUB_CACHE_KEY);
        return [];
      }
      const list = Array.isArray(res?.games)
        ? res.games
        : Array.isArray(res?.data?.games)
          ? res.data.games
          : Array.isArray(res?.data)
            ? res.data
            : [];
      const mapped = list
        .filter((game) => !isBlockedOneGameHubBrand(game))
        .map(mapOneGameHubToCarouselGame)
        .filter((g) => g.gameid);
      if (mapped.length) {
        setCachedProviderSlotGames(ONEGAMEHUB_CACHE_KEY, mapped);
      } else {
        clearCachedProviderSlotGames(ONEGAMEHUB_CACHE_KEY);
      }
      return mapped;
    } catch {
      return getCachedProviderSlotGames(ONEGAMEHUB_CACHE_KEY) || [];
    }
  })().finally(() => {
    hubGamesInflight = null;
  });

  return hubGamesInflight;
}

async function fetchBonaSlotGames() {
  const cached = getCachedProviderSlotGames(BONA_CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await bonaApi.getBonaGames();
    if (res?.enabled === false) {
      clearCachedProviderSlotGames(BONA_CACHE_KEY);
      return [];
    }
    const list = Array.isArray(res?.games)
      ? res.games
      : Array.isArray(res?.data?.games)
        ? res.data.games
        : Array.isArray(res?.data)
          ? res.data
          : [];
    const mapped = list.map(mapBonaToCarouselGame).filter((g) => g.gameid);
    if (mapped.length) {
      setCachedProviderSlotGames(BONA_CACHE_KEY, mapped);
    }
    return mapped;
  } catch {
    return cached || [];
  }
}

async function fetchScorpioSlotGames() {
  const cached = getCachedProviderSlotGames(SCORPIO_CACHE_KEY);
  try {
    const res = await scorpioApi.getScorpioGames();
    if (res?.enabled === false) {
      clearCachedProviderSlotGames(SCORPIO_CACHE_KEY);
      return [];
    }
    const list = Array.isArray(res?.games)
      ? res.games
      : Array.isArray(res?.data?.games)
        ? res.data.games
        : Array.isArray(res?.data)
          ? res.data
          : [];
    const mapped = list
      .map(mapScorpioToCarouselGame)
      .filter((g) => g.gameid);
    if (mapped.length) {
      setCachedProviderSlotGames(SCORPIO_CACHE_KEY, mapped);
      return mapped;
    }
    return cached || [];
  } catch {
    return cached || [];
  }
}

function getSlotProvidersLoadOrder(gitslotparkEnabled = true) {
  if (!gitslotparkEnabled) return [];
  const configured = gitslotparkApi.listConfiguredGitslotparkProviders();
  const providers = configured.length ? configured : gitslotparkApi.GIT_SLOTPARK_PROVIDERS;
  return [
    ...providers.filter((provider) => provider !== 'pragmatic'),
    ...providers.filter((provider) => provider === 'pragmatic'),
  ];
}

function mergeProviderGames(gamesByProvider) {
  const hub = gamesByProvider.get(ONEGAMEHUB_CACHE_KEY) || [];
  const bona = gamesByProvider.get(BONA_CACHE_KEY) || [];
  const scorpio = gamesByProvider.get(SCORPIO_CACHE_KEY) || [];
  const rest = [];
  for (const [key, games] of gamesByProvider.entries()) {
    if (key === ONEGAMEHUB_CACHE_KEY || key === BONA_CACHE_KEY || key === SCORPIO_CACHE_KEY) continue;
    rest.push(...(games || []));
  }
  return [...hub, ...bona, ...scorpio, ...rest];
}

export async function prefetchLobbySlotGames() {
  try {
    const providers = await fetchEnabledSlotProviders();
    const tasks = [];
    if (providers.onegamehub) tasks.push(fetchOneGameHubSlotGames());
    if (providers.bona) tasks.push(fetchBonaSlotGames());
    if (providers.gitslotpark) {
      for (const provider of getSlotProvidersLoadOrder(true)) {
        tasks.push(fetchProviderSlotGames(provider));
      }
    }
    if (providers.scorpio) tasks.push(fetchScorpioSlotGames());
    if (!tasks.length) return [];
    return Promise.all(tasks);
  } catch {
    return [];
  }
}

export function DashboardSlotGamesSection({ catalogOnly = false, categoryId = null }) {
  const resolvedCategoryId = normalizeSlotCategoryId(categoryId);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const userId = user?.userId ?? null;
  const { toast } = useToast();
  const {
    requireDeposit,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
  } = useDepositRequiredGate({ enabled: isAuthenticated });
  const [categories, setCategories] = useState([]);
  const [catalogGames, setCatalogGames] = useState([]);
  const [allGames, setAllGames] = useState([]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState(null);
  const { providers: enabledProviders, loaded: providersLoaded, hasSlotProviders } =
    useEnabledSlotProviders();
  const [hasAnySlotsProvider, setHasAnySlotsProvider] = useState(hasSlotProviders);
  const [visibleCount, setVisibleCount] = useState(CATEGORY_PAGE_SIZE);
  const [activeChip, setActiveChip] = useState('');
  const launchLoadingRef = useRef(false);
  const allGamesRef = useRef([]);
  const recentRowsRef = useRef([]);
  const baseCategoriesRef = useRef([]);

  const pageCanReveal = !loading || categories.length > 0;
  usePageContentReady(pageCanReveal, { immediate: true });

  useEffect(() => {
    launchLoadingRef.current = launchLoading;
  }, [launchLoading]);

  const searchableGames = useMemo(
    () => dedupeCarouselGames(allGames.length ? allGames : allGamesRef.current),
    [allGames]
  );

  const searchResults = useMemo(
    () => searchSlotGames(searchableGames, deferredSearch),
    [searchableGames, deferredSearch]
  );

  const isSearchActive = normalizeSearch(deferredSearch).length > 0;
  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, SEARCH_RESULTS_LIMIT),
    [searchResults]
  );

  const clearSearch = useCallback(() => setSearch(''), []);

  useEffect(() => {
    setVisibleCount(CATEGORY_PAGE_SIZE);
  }, [resolvedCategoryId, deferredSearch]);

  const applyCategories = useCallback((nextGames, baseCategories, recentRows) => {
    const games = Array.isArray(nextGames) ? nextGames : [];
    allGamesRef.current = games;
    baseCategoriesRef.current = baseCategories || [];
    recentRowsRef.current = Array.isArray(recentRows) ? recentRows : [];
    setAllGames(games);
    setCategories(
      withRecentlyPlayedCategory(
        allGamesRef.current,
        baseCategoriesRef.current,
        recentRowsRef.current
      )
    );
  }, []);

  useEffect(() => {
    if (!providersLoaded) return undefined;
    let cancelled = false;
    const paintTimers = [];

    function loadSlotGames() {
      const gamesByProvider = new Map();

      if (enabledProviders.onegamehub) {
        const cachedHub = getCachedProviderSlotGames(ONEGAMEHUB_CACHE_KEY);
        if (cachedHub?.length) gamesByProvider.set(ONEGAMEHUB_CACHE_KEY, cachedHub);
      } else {
        clearCachedProviderSlotGames(ONEGAMEHUB_CACHE_KEY);
      }

      if (enabledProviders.bona) {
        const cachedBona = getCachedProviderSlotGames(BONA_CACHE_KEY);
        if (cachedBona?.length) gamesByProvider.set(BONA_CACHE_KEY, cachedBona);
      } else {
        clearCachedProviderSlotGames(BONA_CACHE_KEY);
      }

      if (enabledProviders.scorpio) {
        const cachedScorpio = getCachedProviderSlotGames(SCORPIO_CACHE_KEY);
        if (cachedScorpio?.length) gamesByProvider.set(SCORPIO_CACHE_KEY, cachedScorpio);
      } else {
        clearCachedProviderSlotGames(SCORPIO_CACHE_KEY);
      }

      const gitslotparkProviders = getSlotProvidersLoadOrder(enabledProviders.gitslotpark);
      if (enabledProviders.gitslotpark) {
        for (const provider of gitslotparkProviders) {
          const cached = getCachedProviderSlotGames(provider);
          if (cached?.length) gamesByProvider.set(provider, cached);
        }
      } else {
        for (const provider of gitslotparkApi.GIT_SLOTPARK_PROVIDERS) {
          clearCachedProviderSlotGames(provider);
        }
      }

      const publish = () => {
        if (cancelled) return;
        applyLobbyGamesToState(
          mergeProviderGames(gamesByProvider),
          applyCategories,
          recentRowsRef,
          setCatalogGames,
          setHasAnySlotsProvider,
          hasSlotProviders,
          setLoading,
          enabledProviders,
        );
      };

      const cachedMerged = mergeProviderGames(gamesByProvider);
      if (cachedMerged.length) {
        publish();
      } else {
        setLoading(true);
      }

      const fetches = [];
      const watch = (key, promise, timeoutMs = PROVIDER_FETCH_TIMEOUT_MS) => {
        let settled = false;
        fetches.push(
          promise.then(
            (games) => {
              settled = true;
              gamesByProvider.set(key, games || []);
              publish();
            },
            () => {
              settled = true;
              gamesByProvider.set(key, getCachedProviderSlotGames(key) || []);
              publish();
            },
          ),
        );
        paintTimers.push(
          window.setTimeout(() => {
            if (cancelled || settled) return;
            if (!gamesByProvider.has(key)) {
              gamesByProvider.set(key, getCachedProviderSlotGames(key) || []);
              publish();
            }
          }, timeoutMs),
        );
      };

      if (enabledProviders.onegamehub) {
        watch(ONEGAMEHUB_CACHE_KEY, fetchOneGameHubSlotGames(), FIRST_PAINT_TIMEOUT_MS);
      }
      if (enabledProviders.bona) {
        watch(BONA_CACHE_KEY, fetchBonaSlotGames());
      }
      if (enabledProviders.scorpio) {
        watch(SCORPIO_CACHE_KEY, fetchScorpioSlotGames());
      }
      for (const provider of gitslotparkProviders) {
        watch(provider, fetchProviderSlotGames(provider));
      }

      if (!fetches.length) {
        publish();
        setLoading(false);
        return;
      }

      paintTimers.push(
        window.setTimeout(() => {
          if (!cancelled) setLoading(false);
        }, FIRST_PAINT_TIMEOUT_MS),
      );

      void Promise.all(fetches).finally(() => {
        if (cancelled) return;
        publish();
        setLoading(false);
      });
    }

    loadSlotGames();
    return () => {
      cancelled = true;
      paintTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [
    applyCategories,
    enabledProviders.bona,
    enabledProviders.gitslotpark,
    enabledProviders.onegamehub,
    enabledProviders.scorpio,
    hasSlotProviders,
    providersLoaded,
  ]);

  useEffect(() => {
    if (!providersLoaded || !enabledProviders.scorpio) return undefined;
    let cancelled = false;
    const refetchScorpio = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchScorpioSlotGames().then((games) => {
        if (cancelled || !games?.length) return;
        applyLobbyGamesToState(
          getAllCachedProviderSlotGames(),
          applyCategories,
          recentRowsRef,
          setCatalogGames,
          setHasAnySlotsProvider,
          hasSlotProviders,
          setLoading,
          enabledProviders,
        );
      });
    };
    window.addEventListener('pj:tab-resume', refetchScorpio);
    return () => {
      cancelled = true;
      window.removeEventListener('pj:tab-resume', refetchScorpio);
    };
  }, [
    applyCategories,
    enabledProviders,
    hasSlotProviders,
    providersLoaded,
  ]);

  useEffect(() => {
    if (!categories.length) return undefined;
    const urls = resolvedCategoryId
      ? collectSlotPreviewImageUrls(
          categories.filter((category) => category.id === resolvedCategoryId),
          visibleCount
        )
      : collectSlotPreviewImageUrls(categories, Infinity);
    warmSlotGameImages(urls, { highCount: resolvedCategoryId ? 48 : 64 });
    return undefined;
  }, [categories, resolvedCategoryId, visibleCount]);

  // Recently Played from the user's slots transactions (bets only).
  useEffect(() => {
    let cancelled = false;

    async function loadRecentlyPlayed() {
      if (authLoading || !providersLoaded) return;

      if (!isAuthenticated) {
        recentRowsRef.current = [];
        if (allGamesRef.current.length) {
          applyCategories(allGamesRef.current, baseCategoriesRef.current, []);
        }
        return;
      }

      try {
        const gitslotparkRes = enabledProviders.gitslotpark
          ? await gitslotparkApi.getRecentlyPlayedSlotGames({ limit: 12 }).catch(() => ({ games: [] }))
          : { games: [] };
        const onegamehubRes = enabledProviders.onegamehub === true
          ? await onegamehubApi.getOneGameHubRecentlyPlayed({ limit: 12 }).catch(() => ({ games: [] }))
          : { games: [] };
        if (cancelled) return;
        const gitslotparkRows = Array.isArray(gitslotparkRes?.games)
          ? gitslotparkRes.games
          : Array.isArray(gitslotparkRes?.data?.games)
            ? gitslotparkRes.data.games
            : [];
        const onegamehubRows = Array.isArray(onegamehubRes?.games)
          ? onegamehubRes.games
          : Array.isArray(onegamehubRes?.data?.games)
            ? onegamehubRes.data.games
            : [];
        const rows = [...gitslotparkRows, ...onegamehubRows];
        recentRowsRef.current = rows;
        // Only merge when catalog games exist so we don't flash Game Vault stubs.
        if (allGamesRef.current.length) {
          applyCategories(allGamesRef.current, baseCategoriesRef.current, rows);
        }
      } catch (err) {
        if (cancelled) return;
        recentRowsRef.current = [];
        console.warn('[slots] recently-played failed', err?.message || err);
      }
    }

    loadRecentlyPlayed();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, userId, applyCategories, location.pathname, enabledProviders.gitslotpark, enabledProviders.onegamehub, providersLoaded]);

  const handlePlayGame = useCallback(
    async (game) => {
      if (!isAuthenticated) {
        navigate('/register', { state: { from: location.pathname } });
        return;
      }

      const gameid = resolveLaunchGameId(game);
      if (!gameid || launchLoadingRef.current) {
        if (!gameid) {
          toast.error('This game cannot be launched right now. Please try another title.');
        }
        return;
      }

      requireDeposit(async () => {
        setLaunchLoading(true);
        setLaunchingGameId(gameid);

        try {
          const provider = game.provider || 'pragmatic';

          if (provider === 'bona') {
            if (gitslotparkApi.getGitslotparkLaunchMode() === 'tab') {
              const res = await bonaApi.launchBonaGame(gameid);
              const url = res?.url ? String(res.url).trim() : '';
              if (!url) throw new Error('Game launch URL not returned');
              window.open(url, '_blank', 'noopener,noreferrer');
              return;
            }

            navigate(`/play/${encodeURIComponent(gameid)}`, {
              state: {
                provider: 'bona',
                name: game.title || 'Bona game',
                returnTo: location.pathname,
                image: game.image || '',
                iconUrls: game.iconUrls || [],
                symbol: game.symbol || '',
                gameType: game.gameType || null,
              },
            });
            return;
          }

          if (isScorpioPlayProvider(provider)) {
            const providerId = Number(game.providerId);
            const gameCode = String(game.gameCode || gameid || '').trim();
            if (!gameCode || !Number.isFinite(providerId) || providerId <= 0) {
              throw new Error('This game cannot be launched right now. Please try another title.');
            }
            if (gitslotparkApi.getGitslotparkLaunchMode() === 'tab') {
              const res = await scorpioApi.launchScorpioGame({ gameCode, providerId });
              const url = res?.url ? String(res.url).trim() : '';
              if (!url) throw new Error('Game launch URL not returned');
              window.open(url, '_blank', 'noopener,noreferrer');
              return;
            }
            navigate(
              `/play/${encodeURIComponent(gameCode)}?provider=${SCORPIO_GAMES_SLUG}&g=${encodeURIComponent(providerId)}`,
              {
                state: {
                  provider: SCORPIO_GAMES_SLUG,
                  providerId,
                  gameCode,
                  name: game.title || 'Game',
                  returnTo: location.pathname,
                  image: game.image || '',
                  iconUrls: game.iconUrls || [],
                },
              }
            );
            return;
          }

          if (provider === 'onegamehub' || provider === '1gamehub') {
            const isFishing = isOneGameHubFishingPlayGame({
              ...game,
              provider,
              gameid,
              lobbyCategoryId: resolvedCategoryId,
            });
            if (gitslotparkApi.getGitslotparkLaunchMode() === 'tab') {
              const res = await onegamehubApi.launchOneGameHubGame(gameid);
              const url = res?.url ? String(res.url).trim() : '';
              if (!url) throw new Error('Game launch URL not returned');
              window.open(url, '_blank', 'noopener,noreferrer');
              return;
            }

            navigate(
              `/play/${encodeURIComponent(gameid)}?provider=onegamehub${isFishing ? '&fishing=1' : ''}`,
              {
              state: {
                provider: 'onegamehub',
                name: game.title || '1GameHub game',
                returnTo: location.pathname,
                image: game.image || '',
                iconUrls: game.iconUrls || [],
                symbol: game.symbol || '',
                categories: game.categories || [],
                lobbyCategoryId: resolvedCategoryId || '',
                isFishing,
              },
            });
            return;
          }

          if (gitslotparkApi.getGitslotparkLaunchMode() === 'tab') {
            const res = await gitslotparkApi.launchSlotGame(gameid, provider);
            const url = res?.url ? String(res.url).trim() : '';
            if (!url) throw new Error('Game launch URL not returned');
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
          }

          navigate(`/play/${encodeURIComponent(gameid)}`, {
            state: {
              provider,
              name: game.title || 'Casino game',
              returnTo: location.pathname,
              image: game.image || '',
              iconUrls: game.iconUrls || [],
              symbol: game.symbol || '',
            },
          });
        } catch (e) {
          if (isDepositRequiredError(e)) {
            openDepositRequiredModal();
          } else {
            toast.error(e.message || 'Unable to launch this game. Please try again.');
          }
        } finally {
          setLaunchLoading(false);
          setLaunchingGameId(null);
        }
      });
    },
    [
      isAuthenticated,
      location.pathname,
      navigate,
      openDepositRequiredModal,
      requireDeposit,
      resolvedCategoryId,
      toast,
    ]
  );

  const categoryLabel = getSlotCategoryLabel(resolvedCategoryId);
  const activeCategory = useMemo(
    () =>
      resolvedCategoryId
        ? categories.find((category) => category.id === resolvedCategoryId) || null
        : null,
    [categories, resolvedCategoryId]
  );
  const categoryGames = useMemo(() => {
    if (!resolvedCategoryId) return [];
    const list = activeCategory?.games || [];
    if (!isSearchActive) return list;
    return searchSlotGames(list, deferredSearch);
  }, [activeCategory, resolvedCategoryId, deferredSearch, isSearchActive]);
  const visibleCategoryGames = useMemo(
    () => categoryGames.slice(0, visibleCount),
    [categoryGames, visibleCount]
  );
  const categoryHasMore = visibleCount < categoryGames.length;

  const loadMoreCategoryGames = useCallback(() => {
    setVisibleCount((count) => count + CATEGORY_PAGE_SIZE);
  }, []);

  const jumpToCategory = useCallback((categoryId) => {
    setActiveChip(categoryId);
    const el = document.getElementById(`slot-cat-${categoryId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (providersLoaded && !hasAnySlotsProvider && !loading && categories.length === 0) {
    return (
      <section id="slot-games" className="dash-slot-carousel-section slot-lobby-coming-soon" aria-label="Coming soon">
        <img src="/coming-soon.png" alt="Coming soon" />
      </section>
    );
  }

  if (catalogOnly) {
    return (
      <>
        <SlotGamesCatalogGrid
          games={catalogGames}
          categories={categories}
          onPlay={handlePlayGame}
          playingGameId={launchingGameId}
          loading={loading}
          guestSpinModal
        />
        <DepositRequiredModal
          open={depositRequiredModalOpen}
          onClose={closeDepositRequiredModal}
          activationBonusType={activationBonusType}
        />
      </>
    );
  }

  if ((loading || !providersLoaded) && categories.length === 0) {
    return (
      <section id="slot-games" className="dash-slot-carousel-section" aria-busy="true">
        <div className="dash-section-head">
          <h2 className="dash-section-title">{resolvedCategoryId ? categoryLabel : 'Slot Games'}</h2>
          <p className="dash-section-sub">Loading casino games from top providers…</p>
        </div>
        <div className="dash-slot-games-loader">
          <AppLoader fillPage={false} message="Loading casino games" />
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return (
      <section id="slot-games" className="dash-slot-carousel-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">{resolvedCategoryId ? categoryLabel : 'Slot Games'}</h2>
          <p className="dash-section-sub">We could not load casino games right now.</p>
        </div>
        <div className="dash-games-empty dash-animate-in">
          <span className="dash-games-empty-icon" aria-hidden>🎰</span>
          <p className="dash-games-empty-title">No casino games available</p>
          <p className="dash-games-empty-sub">
            No games are available from the providers enabled for this store. Please try again in a moment.
          </p>
          <button
            type="button"
            className="dash-slot-games-retry-btn"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (resolvedCategoryId) {
    return (
      <>
        <section id="slot-games" className="dash-slot-carousel-section">
          <div className="dash-section-head">
            <h2 className="dash-section-title">{categoryLabel}</h2>
            <p className="dash-section-sub">Browse and play</p>
          </div>

          <SlotGamesSearchBar
            value={search}
            onChange={setSearch}
            onClear={clearSearch}
            resultCount={isSearchActive ? categoryGames.length : null}
            disabled={loading && searchableGames.length === 0}
            placeholder="Type a game name…"
          />

          {categoryGames.length === 0 ? (
            <div className="dash-games-empty dash-animate-in">
              <span className="dash-games-empty-icon" aria-hidden>🎰</span>
              <p className="dash-games-empty-title">No games found</p>
              <p className="dash-games-empty-sub">
                {isSearchActive
                  ? `Nothing matched “${normalizeSearch(deferredSearch)}” in ${categoryLabel}.`
                  : `No ${categoryLabel} games are available right now.`}
              </p>
            </div>
          ) : (
            <>
              <div className="dash-slot-carousel-panel dash-slot-carousel-root">
                <SlotGamesCarousel
                  label=""
                  games={visibleCategoryGames}
                  ariaLabel={`${categoryLabel} casino games`}
                  categoryId={resolvedCategoryId}
                  grid
                  gridClassName={`dash-slot-catalog-grid dash-slot-search-grid${
                    resolvedCategoryId === 'others'
                      ? ' dash-slot-others-grid'
                      : resolvedCategoryId === 'fishing' ||
                          resolvedCategoryId === 'live-casino' ||
                          resolvedCategoryId === 'zesus' ||
                          resolvedCategoryId === 'olympus' ||
                          resolvedCategoryId === 'candy' ||
                          resolvedCategoryId === 'animal'
                        ? ' dash-slot-fishing-grid'
                        : ''
                  }`}
                  onPlay={handlePlayGame}
                  playingGameId={launchingGameId}
                />
              </div>
              {categoryHasMore ? (
                <div className="dash-slot-load-more-wrap">
                  <button type="button" className="dash-slot-load-more-btn" onClick={loadMoreCategoryGames}>
                    Load more games
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
        <DepositRequiredModal
          open={depositRequiredModalOpen}
          onClose={closeDepositRequiredModal}
          activationBonusType={activationBonusType}
        />
      </>
    );
  }

  return (
    <>
      <section id="slot-games" className="dash-slot-carousel-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">Slot Games</h2>
          <p className="dash-section-sub">
            {isSearchActive
              ? 'Search results across every provider.'
              : 'Slide through each category and tap to play.'}
          </p>
        </div>

        {isSearchActive ? null : <RecentBigWins variant="lobby" />}

        <SlotGamesSearchBar
          value={search}
          onChange={setSearch}
          onClear={clearSearch}
          resultCount={isSearchActive ? searchResults.length : null}
          disabled={loading && searchableGames.length === 0}
          placeholder="Type a game name…"
        />

        {isSearchActive ? (
          <div className="dash-slot-search-results dash-animate-in">
            {searchResults.length === 0 ? (
              <div className="dash-games-empty dash-slot-search-empty">
                <span className="dash-games-empty-icon" aria-hidden>🔍</span>
                <p className="dash-games-empty-title">No games found</p>
                <p className="dash-games-empty-sub">
                  Nothing matched “{normalizeSearch(deferredSearch)}”. Try another name or provider.
                </p>
                <button type="button" className="dash-slot-games-retry-btn" onClick={clearSearch}>
                  Clear search
                </button>
              </div>
            ) : (
              <>
                {searchResults.length > SEARCH_RESULTS_LIMIT ? (
                  <p className="dash-slot-search-limit">
                    Showing {SEARCH_RESULTS_LIMIT} of {searchResults.length.toLocaleString()} — refine
                    your search to narrow it down.
                  </p>
                ) : null}
                <div className="dash-slot-carousel-panel dash-slot-carousel-root">
                  <SlotGamesCarousel
                    label=""
                    games={visibleSearchResults}
                    ariaLabel="Casino game search results"
                    grid
                    gridClassName="dash-slot-catalog-grid dash-slot-search-grid"
                    onPlay={handlePlayGame}
                    playingGameId={launchingGameId}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {categories.length > 1 ? (
              <div className="slot-lobby-chips" role="tablist" aria-label="Game categories">
                {categories.filter((category) => category.id !== 'top-fishing' && category.id !== 'top-games').map((category) => {
                  const meta = getSlotLobbyCategoryMeta(category.id, category.games?.length);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className="slot-lobby-chip"
                      style={{ '--c': meta.color }}
                      aria-pressed={activeChip === category.id}
                      onClick={() => jumpToCategory(category.id)}
                    >
                      <SlotLobbyIcon name={meta.icon} />
                      {category.id === 'recently-played' ? 'Play again' : category.id === 'buffalo-blast' ? 'Buffalo Blast' : category.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="dash-slot-carousel-panel dash-slot-carousel-root">
              {categories.map((category) => {
                const isRecent = category.id === 'recently-played';
                const isRankedRow = Boolean(category.ranked);
                const isBuffaloBlast = category.id === 'buffalo-blast';
                const isOlympus = category.id === 'olympus';
                const isCandy = category.id === 'candy';
                const isAnimal = category.id === 'animal';
                const lobbyLimit = isRecent
                  ? LOBBY_DESKTOP_GAMES_PER_ROW
                  : isRankedRow
                    ? TOP_FISHING_GAMES_COUNT
                    : isBuffaloBlast || isOlympus || isCandy || isAnimal
                      ? Number.POSITIVE_INFINITY
                      : LOBBY_DESKTOP_GAMES_PER_ROW * LOBBY_DESKTOP_ROWS;
                return (
                  <div key={category.id}>
                    <SlotGamesCarousel
                      categoryId={category.id}
                      label={isRecent ? 'Play again' : category.label}
                      games={gamesForCasinoLobbyRow(category, lobbyLimit)}
                      ranked={isRankedRow}
                      compact={isRecent}
                      hideNav
                      ariaLabel={`${category.label} casino games`}
                      onPlay={handlePlayGame}
                      playingGameId={launchingGameId}
                      showAllHref={isRecent || isRankedRow || isBuffaloBlast || isOlympus || isCandy || isAnimal ? null : getSlotCategoryPath(category.id)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </>
  );
}
