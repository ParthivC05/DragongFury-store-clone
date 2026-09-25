const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeSlotImageUrl(url) {
  return String(url || '').replace(/\u0445/g, 'x').replace(/\u0425/g, 'X');
}
const STORAGE_KEY = 'partner-slot-catalog-v5';
const providerCache = new Map();

function withPlayableImage(game) {
  if (!game || typeof game !== 'object') return game;
  const image = normalizeSlotImageUrl(game.image);
  const iconUrls = Array.isArray(game.iconUrls) ? game.iconUrls.map(normalizeSlotImageUrl) : game.iconUrls;
  if (image === game.image && iconUrls === game.iconUrls) return game;
  return { ...game, image, iconUrls };
}

function slimGames(games) {
  return (games || []).map((game) => ({
    id: game.id,
    gameid: game.gameid,
    provider: game.provider,
    symbol: game.symbol,
    title: game.title,
    image: normalizeSlotImageUrl(game.image),
    iconUrls: Array.isArray(game.iconUrls) ? game.iconUrls.slice(0, 1).map(normalizeSlotImageUrl) : [],
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
  return entry.games.map(withPlayableImage);
}

export function getAllCachedProviderSlotGames() {
  const out = [];
  const seen = new Set();
  for (const entry of providerCache.values()) {
    for (const game of entry?.games || []) {
      const id = String(game?.gameid || game?.id || game?.title || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(withPlayableImage(game));
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
