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

/**
 * Returns the image URL for a game for display on the user side.
 * @param {{ name: string, image_url?: string | null, imageUrl?: string | null, gameKey?: string | null }} game
 * @returns {string}
 */
export function getGameImageUrl(game) {
  const name = game?.name;
  const compactName = compactGameKey(name);
  const compactKey = compactGameKey(game?.gameKey);
  const aliasedSlug = IMAGE_SLUG_ALIASES[compactKey] || IMAGE_SLUG_ALIASES[compactName];
  if (aliasedSlug === 'goldendragon') {
    return '/optimized/games/goldendragon.webp';
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
