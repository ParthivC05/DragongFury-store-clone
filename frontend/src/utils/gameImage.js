import { compactGameKey } from './gameDisplay';

/** Slugs that reuse another game's image in public/games. */
const IMAGE_SLUG_ALIASES = {
  gamevault2: 'gamevault',
  gamevaultagent: 'gamevault',
  juwa20: 'juwa2.0',
  juwa20agent: 'juwa2.0',
  juwaagent: 'juwa',
  juwabot: 'juwa',
  juwanewbot: 'juwa',
  pandamaster2: 'pandamaster',
  pandamasternewbot: 'pandamaster',
  goldendragonnewbot: 'goldendragon',
  goldendragon2: 'goldendragon',
  milkywayagent: 'milkyway',
  milkywaybot: 'milkyway',
  milkywayautomation: 'milkyway',
  milkywaylegacy: 'milkyway',
};

/** Live portrait covers (320×432). Used instead of older square or circular art. */
const PLATFORM_PORTRAIT = {
  juwa: '/df-online/platforms/juwa.webp',
  juwa20: '/df-online/platforms/juwa.webp',
  'juwa2.0': '/df-online/platforms/juwa.webp',
  gamevault: '/df-online/platforms/game-vault.webp',
  ultrapanda: '/df-online/platforms/ultra-panda.webp',
  milkyway: '/df-online/platforms/milky-way.webp',
  mafia: '/df-online/platforms/mafia.webp',
  firekirin: '/df-online/platforms/fire-kirin.webp',
  orionstars: '/df-online/platforms/orion-stars.webp',
  orionstar: '/df-online/platforms/orion-stars.webp',
  pandamaster: '/df-online/platforms/panda-master.webp',
  pandamasters: '/df-online/platforms/panda-master.webp',
  goldendragon: '/df-online/platforms/golden-dragon.webp',
  cashmachine: '/df-online/platforms/cash-machine.webp',
  cashmachine777: '/df-online/platforms/cash-machine.webp',
  megaspin: '/df-online/platforms/mega-spin.webp',
  joker: '/df-online/platforms/joker.webp',
  dragonfury: '/df-online/platforms/dragon-fury.webp'
};

/**
 * Returns the image URL for a game for display on the user side.
 * @param {{ name: string, image_url?: string | null, imageUrl?: string | null, gameKey?: string | null }} game
 * @returns {string}
 */
export function getGameImageUrl(game) {
  const name = game?.name;
  const compactName = compactGameKey(name);
  const compactKey = compactGameKey(game?.gameKey);
  const portrait =
    PLATFORM_PORTRAIT[compactKey] ||
    PLATFORM_PORTRAIT[compactName] ||
    PLATFORM_PORTRAIT[IMAGE_SLUG_ALIASES[compactKey]] ||
    PLATFORM_PORTRAIT[IMAGE_SLUG_ALIASES[compactName]];
  if (portrait) return portrait;
  const aliasedSlug = IMAGE_SLUG_ALIASES[compactKey] || IMAGE_SLUG_ALIASES[compactName];
  if (aliasedSlug === 'goldendragon') {
    return '/df-online/platforms/golden-dragon.webp';
  }

  const url = game?.image_url || game?.imageUrl;
  if (url && typeof url === 'string' && url.trim()) {
    return url.trim();
  }
  if (!name || typeof name !== 'string') {
    return '';
  }
  const dotSlug = name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9.]/g, '');
  const imageSlug = aliasedSlug || IMAGE_SLUG_ALIASES[dotSlug] || dotSlug;
  if (!imageSlug) return '';
  return `/optimized/games/${imageSlug}.webp`;
}
