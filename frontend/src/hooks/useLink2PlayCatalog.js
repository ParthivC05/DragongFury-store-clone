import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { LINK2PLAY_GAMES } from '../config/link2playGames';
import { searchPlatformGames } from '../utils/platformGameSearch';

export const LINK2PLAY_FILTER_DEFS = [
  { id: 'all', label: 'All games' },
  { id: 'live', label: 'Live' },
  { id: 'soon', label: 'Coming soon', requiresSoon: true },
  { id: 'popular', label: 'Popular', requiresPopular: true },
];

/** @deprecated Use LINK2PLAY_FILTER_DEFS */
export const LINK2PLAY_FILTERS = LINK2PLAY_FILTER_DEFS;

function isSoonGame(game) {
  return game?.status === 'soon';
}

function isLiveGame(game) {
  if (isSoonGame(game)) return false;
  // Admin rows: respect checkbox. Hardcoded fallback: treat as live.
  if (game?.fromAdmin) return game.isLive === true;
  return true;
}

function isPopularGame(game) {
  return Boolean(game?.popular || game?.isPopular);
}

/**
 * Search + filter state for the Link2Play catalog.
 * Uses deferred search so typing stays responsive on long lists.
 */
export function useLink2PlayCatalog(games = LINK2PLAY_GAMES) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const deferredQuery = useDeferredValue(query);

  const clearQuery = useCallback(() => setQuery(''), []);

  const catalogMeta = useMemo(() => {
    const list = Array.isArray(games) ? games.filter(Boolean) : [];
    return {
      list,
      hasSoon: list.some(isSoonGame),
      hasPopular: list.some(isPopularGame),
      hasLive: list.some(isLiveGame),
    };
  }, [games]);

  const filters = useMemo(
    () =>
      LINK2PLAY_FILTER_DEFS.filter((chip) => {
        if (chip.requiresSoon && !catalogMeta.hasSoon) return false;
        if (chip.requiresPopular && !catalogMeta.hasPopular) return false;
        if (chip.id === 'live' && !catalogMeta.hasLive) return false;
        return true;
      }),
    [catalogMeta.hasSoon, catalogMeta.hasPopular, catalogMeta.hasLive]
  );

  // If a filter disappears (e.g. no soon games), fall back to all.
  const activeFilter = filters.some((f) => f.id === filter) ? filter : 'all';

  const catalog = useMemo(() => {
    const searched = searchPlatformGames(catalogMeta.list, deferredQuery);
    const live = [];
    const soon = [];

    for (const game of searched) {
      const isSoon = isSoonGame(game);
      const liveFlag = isLiveGame(game);
      const popularFlag = isPopularGame(game);

      if (activeFilter === 'live' && !liveFlag) continue;
      if (activeFilter === 'soon' && !isSoon) continue;
      if (activeFilter === 'popular' && !popularFlag) continue;

      if (isSoon) soon.push(game);
      else live.push(game);
    }

    return {
      live,
      soon,
      resultCount: live.length + soon.length,
      isSearching: String(deferredQuery || '').trim().length > 0,
      isFiltering: activeFilter !== 'all',
    };
  }, [catalogMeta.list, deferredQuery, activeFilter]);

  const setFilterSafe = useCallback(
    (next) => {
      if (filters.some((f) => f.id === next)) setFilter(next);
      else setFilter('all');
    },
    [filters]
  );

  return {
    query,
    setQuery,
    clearQuery,
    filter: activeFilter,
    setFilter: setFilterSafe,
    filters,
    ...catalog,
  };
}
