function normalizePlatformName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.-]+/g, '');
}

/** Map API / variant names to a single platform slot in the guest grid. */
const PLATFORM_KEY_ALIASES = {
  gamevault2: 'gamevault',
  gamevaultagent: 'gamevault',
  juwa20agent: 'juwa20',
  juwaagent: 'juwa',
  juwabot: 'juwa',
  orionstar: 'orionstars',
  pandamaster: 'pandamasters',
  mafiaagent: 'mafia',
};

function canonicalPlatformKey(name) {
  const key = normalizePlatformName(name);
  return PLATFORM_KEY_ALIASES[key] || key;
}

/** Curated platforms shown on the guest landing games section (order matters). */
export const FEATURED_PLATFORM_GAMES = [
  { name: 'Golden Dragon', image_url: '/optimized/games/goldendragon.webp' },
  { name: 'Ultra Panda', image_url: '/optimized/games/ultrapanda.webp' },
  { name: 'Egame99', image_url: '/optimized/games/egame99.webp', isNew: true },
  { name: 'Vblink', image_url: '/optimized/games/vblink.webp' },
  { name: 'Juwa', image_url: '/optimized/games/juwa.webp', isNew: true },
  { name: 'Firekirin', image_url: '/optimized/games/firekirin.webp' },
  { name: 'Orionstars', image_url: '/optimized/games/orionstars.webp' },
  { name: 'CashMachine777', image_url: '/optimized/games/cashmachine777.webp' },
  { name: 'Gameroom', image_url: '/optimized/games/gameroom.webp' },
  { name: 'Mafia', image_url: '/games/mafia.webp' },
  { name: 'Gamevault', image_url: '/optimized/games/gamevault.webp' },
  { name: 'Juwa 2.0', image_url: '/optimized/games/juwa2.0.webp' },
  { name: 'Milkyway', image_url: '/optimized/games/milkyway.webp' },
  { name: 'Pandamasters', image_url: '/optimized/games/pandamaster.webp' },
  { name: 'Riversweeps', image_url: '/optimized/games/riversweeps.webp' },
  { name: 'Vegasx', image_url: '/optimized/games/vegasx.webp' },
];

/**
 * Guest landing grid: one tile per featured platform.
 * API catalog entries replace static placeholders when names match (incl. variants).
 */
export function buildGuestPlatformGames(apiGames) {
  const apiByKey = new Map();
  (Array.isArray(apiGames) ? apiGames : []).forEach((game) => {
    const key = canonicalPlatformKey(game?.name);
    if (key && !apiByKey.has(key)) apiByKey.set(key, game);
  });

  return FEATURED_PLATFORM_GAMES.map((featured) => {
    const key = canonicalPlatformKey(featured.name);
    const fromApi = apiByKey.get(key);
    if (!fromApi) {
      return {
        id: `featured-${key}`,
        name: featured.name,
        image_url: featured.image_url,
        isNew: Boolean(featured.isNew),
      };
    }
    return {
      ...fromApi,
      image_url: featured.image_url || fromApi.image_url,
      isNew: Boolean(featured.isNew),
    };
  });
}
