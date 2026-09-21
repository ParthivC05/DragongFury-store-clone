import { compactGameKey } from './gameDisplay';

function listingDedupeKey(game) {
  const key = compactGameKey(game?.gameKey);
  if (key) return `key:${key}`;
  return `name:${String(game?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')}`;
}

/**
 * Remove duplicate games for dashboard listing (by id, then by gameKey or normalized name).
 */
export function dedupeGamesForListing(games) {
  if (!Array.isArray(games)) return [];

  const seenIds = new Set();
  const byId = games.filter((g) => {
    const id = g?.id;
    if (id == null || id === '') return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  const seenKeys = new Set();
  return byId.filter((g) => {
    const key = listingDedupeKey(g);
    if (!key || key === 'name:') return true;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}
