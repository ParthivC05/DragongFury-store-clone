import { useEffect, useState } from 'react';
import { STORE_CODE } from '../../config/site';
import { prefetchLobbySlotGames } from './DashboardSlotGamesSection';
import { getAllCachedProviderSlotGames } from '../../utils/dashboardSlotGamesCache';
import {
  appendBonaToSlotCategories,
  buildOrionstarSlotCategories,
  getSlotCategoryPath,
  isHiddenSlotCategoryId,
} from '../../utils/gitslotparkLandingGames';
import { fetchEnabledSlotProviders } from '../../hooks/useEnabledSlotProviders';

export const IS_PLAYJUWA_STORE =
  String(STORE_CODE || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') === 'playjuwa';

const SKIP_CATEGORY_IDS = new Set(['recently-played', 'top-fishing']);
const MOBILE_GAMES_PER_GROUP = 2;
const DESKTOP_GAMES_PER_GROUP = 3;
const DESKTOP_MQ = '(min-width: 768px)';
const SLIDER_GAME_COUNT = 24;
const MIN_CATEGORY_GAMES = 6;
const POLL_MS = 1200;
const POLL_MAX_MS = 16000;

function collectHomeCasinoCategories(providerFlags = {}) {
  const allGames = getAllCachedProviderSlotGames();
  if (!allGames.length) return [];

  const categories = appendBonaToSlotCategories(
    buildOrionstarSlotCategories(allGames, providerFlags),
    allGames
  );

  return categories
    .filter((category) => {
      const id = String(category?.id || '');
      if (!id || SKIP_CATEGORY_IDS.has(id) || isHiddenSlotCategoryId(id)) return false;
      return (category.games?.length || 0) >= MIN_CATEGORY_GAMES;
    })
    .map((category) => ({
      id: category.id,
      label: category.label,
      count: category.games.length,
      href: getSlotCategoryPath(category.id),
      games: category.games.slice(0, SLIDER_GAME_COUNT),
    }));
}

export function useLobbyPlatformChunkSize() {
  const [size, setSize] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches
      ? DESKTOP_GAMES_PER_GROUP
      : MOBILE_GAMES_PER_GROUP
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const apply = () => setSize(mq.matches ? DESKTOP_GAMES_PER_GROUP : MOBILE_GAMES_PER_GROUP);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return size;
}

export function usePlayJuwaHomeCasinoCategories({ enabled = false } = {}) {
  const [categories, setCategories] = useState(() =>
    enabled && IS_PLAYJUWA_STORE ? collectHomeCasinoCategories() : []
  );

  useEffect(() => {
    if (!enabled || !IS_PLAYJUWA_STORE) {
      setCategories([]);
      return undefined;
    }

    let cancelled = false;
    let pollId = 0;
    const startedAt = Date.now();

    const apply = (providerFlags) => {
      const next = collectHomeCasinoCategories(providerFlags);
      if (next.length) setCategories(next);
      return next.length > 0;
    };

    fetchEnabledSlotProviders()
      .then((providers) => {
        if (cancelled) return null;
        const flags = {
          gitslotpark: Boolean(providers?.gitslotpark),
          onegamehub: Boolean(providers?.onegamehub),
        };
        apply(flags);
        return flags;
      })
      .then((flags) => {
        if (cancelled || !flags) return;
        prefetchLobbySlotGames().finally(() => {
          if (!cancelled) apply(flags);
        });

        pollId = window.setInterval(() => {
          if (cancelled) return;
          if (apply(flags) || Date.now() - startedAt > POLL_MAX_MS) {
            window.clearInterval(pollId);
          }
        }, POLL_MS);
      })
      .catch(() => {
        if (!cancelled) apply({});
      });

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [enabled]);

  return categories;
}

export function buildLobbyMixRows(games, categories, gamesPerGroup = MOBILE_GAMES_PER_GROUP, options = {}) {
  const list = Array.isArray(games) ? games : [];
  const cats = Array.isArray(categories) ? categories : [];
  const chunkSize = Math.max(1, Number(gamesPerGroup) || MOBILE_GAMES_PER_GROUP);
  const insertAfter = options.insertAfter;
  if (!list.length) return [];

  const rows = [];
  let current = [];
  let gameOffset = 0;
  let catIndex = 0;
  let featuredPending = false;

  const flush = (category) => {
    if (!current.length) return;
    rows.push({ games: current, category, gameOffset });
    gameOffset += current.length;
    current = [];
  };

  const nextCasinoCategory = () => (cats.length ? cats[catIndex++ % cats.length] : null);

  for (const game of list) {
    current.push(game);
    const matched = Boolean(insertAfter?.match?.(game) && insertAfter.category);
    if (matched) featuredPending = true;

    if (matched && insertAfter.flushImmediately) {
      flush(insertAfter.category);
      featuredPending = false;
      continue;
    }

    if (current.length >= chunkSize) {
      flush(featuredPending && insertAfter?.category ? insertAfter.category : nextCasinoCategory());
      featuredPending = false;
    }
  }

  flush(featuredPending && insertAfter?.category ? insertAfter.category : nextCasinoCategory());
  return rows;
}

export function shouldMixHomeCasinoCategories({
  isPlayJuwa = IS_PLAYJUWA_STORE,
  isAuthenticated,
  filter,
  isSearchActive,
  categories,
} = {}) {
  return Boolean(
    isPlayJuwa &&
      isAuthenticated &&
      filter === 'all' &&
      !isSearchActive &&
      (categories?.length || 0) > 0
  );
}
