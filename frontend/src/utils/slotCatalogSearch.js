/** Normalize user query / field text for casino catalog search. */
export function normalizeSlotCatalogSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function providerSearchText(provider) {
  return normalizeSlotCatalogSearch(provider);
}

/**
 * Rank how well a casino catalog game matches a normalized query.
 * Lower score = better match. Returns -1 when there is no match.
 */
export function rankSlotCatalogMatch(game, query) {
  if (!query) return -1;

  const title = normalizeSlotCatalogSearch(game?.title || game?.name);
  const symbol = normalizeSlotCatalogSearch(game?.symbol || game?.gameCode || game?.gameId);
  const provider = providerSearchText(game?.provider);

  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (symbol && symbol.startsWith(query)) return 2;
  if (title.includes(query)) return 3;
  if (symbol && symbol.includes(query)) return 4;
  if (provider && provider.includes(query)) return 5;
  return -1;
}

/**
 * Filter and rank casino catalog games by title / symbol / provider.
 * @param {Array} games
 * @param {string} rawQuery
 * @returns {Array}
 */
export function searchSlotCatalogGames(games, rawQuery) {
  const query = normalizeSlotCatalogSearch(rawQuery);
  const list = Array.isArray(games) ? games.filter(Boolean) : [];
  if (!query) return [...list];

  const ranked = [];
  for (const game of list) {
    const score = rankSlotCatalogMatch(game, query);
    if (score < 0) continue;
    ranked.push({ game, score });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const aLabel = String(a.game?.title || a.game?.name || '');
    const bLabel = String(b.game?.title || b.game?.name || '');
    return aLabel.localeCompare(bLabel);
  });

  return ranked.map((entry) => entry.game);
}
