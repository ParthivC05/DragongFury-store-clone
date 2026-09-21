const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'partner-slot-catalog-v5';
const providerCache = new Map();

function slimGames(games) {
  return (games || []).map((game) => ({
    id: game.id,
    gameid: game.gameid,
    provider: game.provider,
    symbol: game.symbol,
    title: game.title,
    image: game.image,
    iconUrls: Array.isArray(game.iconUrls) ? game.iconUrls.slice(0, 1) : [],
    brand: game.brand || '',
    categories: Array.isArray(game.categories) ? game.categories.slice(0, 1) : [],
    providerId: game.providerId ?? null,
    gameCode: game.gameCode || '',
    gameType: game.gameType ?? null,
  }));
}

let persistTimer = null;

function writeCacheNow() {
  if (typeof localStorage === 'undefined') return;
  try {
    const byProvider = {};
    for (const [provider, entry] of providerCache.entries()) {
      byProvider[provider] = slimGames(entry.games);
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cachedAt: Date.now(), byProvider })
    );
  } catch {
    /* quota / private mode */
  }
}

function persistCache() {
  if (persistTimer != null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeCacheNow();
  }, 400);
}

function hydrateCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > STALE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const byProvider = parsed.byProvider || {};
    for (const [provider, games] of Object.entries(byProvider)) {
      if (Array.isArray(games) && games.length) {
        providerCache.set(provider, { games, cachedAt: parsed.cachedAt });
      }
    }
  } catch {
    /* ignore bad cache */
  }
}

hydrateCache();

export function getCachedProviderSlotGames(provider) {
  const entry = providerCache.get(provider);
  if (!entry?.games?.length) return null;
  return entry.games;
}

export function getAllCachedProviderSlotGames() {
  const out = [];
  const seen = new Set();
  for (const entry of providerCache.values()) {
    for (const game of entry?.games || []) {
      const id = String(game?.gameid || game?.id || game?.title || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(game);
    }
  }
  return out;
}

export function setCachedProviderSlotGames(provider, games) {
  providerCache.set(provider, { games, cachedAt: Date.now() });
  persistCache();
}

export function clearCachedProviderSlotGames(provider) {
  if (!providerCache.has(provider)) return;
  providerCache.delete(provider);
  persistCache();
}

export function clearDashboardSlotGamesCache() {
  providerCache.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
