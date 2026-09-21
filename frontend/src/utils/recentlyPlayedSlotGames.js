'use strict';

const RECENT_CATEGORY_LIMIT = 12;

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function sameGameId(a, b) {
  return String(a ?? '') === String(b ?? '');
}

/**
 * Match a transaction row (gameId + provider) to a catalog carousel game.
 * `gitslotpark` / empty provider matches any non-bona catalog provider.
 * Only returns catalog hits (with real artwork) — never image-less stubs.
 */
export function matchCatalogGameForRecentPlay(allGames, recent) {
  const gameId = recent?.gameId ?? recent?.gameid;
  const provider = normalizeProvider(recent?.provider);
  if (gameId == null || String(gameId).trim() === '') return null;

  const catalog = Array.isArray(allGames) ? allGames : [];
  const exact = catalog.find(
    (game) =>
      sameGameId(game.gameid ?? game.gameId, gameId) &&
      normalizeProvider(game.provider) === provider
  );
  if (exact) return exact;

  if (!provider || provider === 'gitslotpark') {
    return (
      catalog.find(
        (game) =>
          sameGameId(game.gameid ?? game.gameId, gameId) &&
          normalizeProvider(game.provider) !== 'bona'
      ) || null
    );
  }

  return null;
}

/**
 * Build Recently Played category from slots-transaction API rows + live catalog.
 * @param {object[]} allGames
 * @param {Array<{ gameId: number, provider: string }>} recentRows
 */
export function buildRecentlyPlayedSlotCategoryFromTransactions(
  allGames,
  recentRows,
  limit = RECENT_CATEGORY_LIMIT
) {
  const rows = Array.isArray(recentRows) ? recentRows : [];
  const games = [];
  const seen = new Set();

  for (const row of rows) {
    if (games.length >= limit) break;
    const matched = matchCatalogGameForRecentPlay(allGames, row);
    if (!matched) continue;
    const key = `${normalizeProvider(matched.provider)}:${String(matched.gameid ?? matched.gameId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(matched);
  }

  if (!games.length) return null;
  return {
    id: 'recently-played',
    label: 'Recently Played',
    games,
    ranked: false,
  };
}

export { RECENT_CATEGORY_LIMIT };
