import { compactGameKey, getGameDisplayName } from './gameDisplay';

/** Normalize user query / field text for platform game search. */
export function normalizePlatformSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Rank how well a platform game matches a normalized query.
 * Lower score = better match. Returns -1 when there is no match.
 */
export function rankPlatformGameMatch(game, query) {
  if (!query) return -1;

  const display = normalizePlatformSearch(getGameDisplayName(game));
  const raw = normalizePlatformSearch(game?.name);
  const compact = compactGameKey(game?.name);
  const compactQuery = query.replace(/\s+/g, '');

  if (display === query || raw === query) return 0;
  if (display.startsWith(query) || raw.startsWith(query)) return 1;
  if (compactQuery && compact.startsWith(compactQuery)) return 2;
  if (display.includes(query) || raw.includes(query)) return 3;
  if (compactQuery && compact.includes(compactQuery)) return 4;
  return -1;
}

/**
 * Filter and rank platform games by name / display label.
 * @param {Array} games
 * @param {string} rawQuery
 * @returns {Array}
 */
export function searchPlatformGames(games, rawQuery) {
  const query = normalizePlatformSearch(rawQuery);
  const list = Array.isArray(games) ? games.filter(Boolean) : [];
  if (!query) return [...list];

  const ranked = [];

  for (const game of list) {
    const score = rankPlatformGameMatch(game, query);
    if (score < 0) continue;
    ranked.push({ game, score });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const aLabel = getGameDisplayName(a.game) || String(a.game?.name || '');
    const bLabel = getGameDisplayName(b.game) || String(b.game?.name || '');
    return aLabel.localeCompare(bLabel);
  });

  return ranked.map((entry) => entry.game);
}
