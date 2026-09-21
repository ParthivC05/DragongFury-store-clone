import { STORE_CODE } from '../config/site';
import { getStoreWinnerNamePool } from './storeWinnerNames';

export const LIVE_WIN_GAMES = [
  { name: 'Juwa', image: '/optimized/games/juwa.webp' },
  { name: 'Juwa 2.0', image: '/optimized/games/juwa2.0.webp' },
  { name: 'Panda Master', image: '/optimized/games/pandamaster.webp' },
  { name: 'Fire Kirin', image: '/optimized/games/firekirin.webp' },
  { name: 'Milky Way', image: '/optimized/games/milkyway.webp' },
  { name: 'Orion Stars', image: '/optimized/games/orionstars.webp' },
  { name: 'Vegas X', image: '/optimized/games/vegasx.webp' },
  { name: 'Game Vault', image: '/optimized/games/gamevault.webp' },
  { name: 'Golden Dragon', image: '/optimized/games/goldendragon.webp' },
  { name: 'Ultra Panda', image: '/optimized/games/ultrapanda.webp' },
  { name: 'River Sweeps', image: '/optimized/games/riversweeps.webp' },
  { name: 'Cash Machine', image: '/optimized/games/cashmachine777.webp' },
  { name: 'VBlink', image: '/optimized/games/vblink.webp' },
  { name: 'Gameroom', image: '/optimized/games/gameroom.webp' },
  { name: 'Mafia', image: '/games/mafia.webp' },
  { name: 'Egame 99', image: '/optimized/games/egame99.webp' },
];

/** Fallback slot titles when the slots catalog cache is still empty. */
export const LIVE_WIN_SLOT_GAMES_FALLBACK = [
  { name: 'Mahjong Ways 2', image: '/optimized/games/gamevault.webp' },
  { name: 'Sweet Bonanza', image: '/optimized/games/gamevault.webp' },
  { name: 'Gates of Olympus', image: '/optimized/games/gamevault.webp' },
  { name: 'Starlight Princess', image: '/optimized/games/gamevault.webp' },
  { name: 'Sugar Rush', image: '/optimized/games/gamevault.webp' },
  { name: 'Wisdom of Athena', image: '/optimized/games/gamevault.webp' },
  { name: 'Fortune Tiger', image: '/optimized/games/gamevault.webp' },
  { name: 'Lucky Neko', image: '/optimized/games/gamevault.webp' },
];

export const LIVE_WIN_USERNAME_PREFIXES = getStoreWinnerNamePool(STORE_CODE).prefixes;

export const LIVE_WIN_ACTIONS = ['won', 'redeemed'];

export const LIVE_WIN_TIMING = {
  initialDelayMin: 6000,
  initialDelayMax: 12000,
  visibleMs: 4500,
  enterMs: 400,
  exitMs: 400,
  gapMin: 14000,
  gapMax: 32000,
};

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createDeckPicker(items, getKey = (item) => item) {
  let deck = shuffleArray(items);
  let index = 0;

  return {
    next(excludeKey) {
      const normalizedExclude = excludeKey == null
        ? null
        : (typeof excludeKey === 'string' ? excludeKey : getKey(excludeKey));

      const maxAttempts = deck.length;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (index >= deck.length) {
          deck = shuffleArray(items);
          index = 0;
        }

        const item = deck[index];
        index += 1;
        if (getKey(item) !== normalizedExclude) return item;
      }

      return deck[0];
    },
  };
}

export function pickUniqueAmount(excludeAmount) {
  let amount = '';
  let attempts = 0;

  do {
    const whole = randomBetween(95, 920);
    const cents = randomBetween(0, 99);
    amount = `${whole}.${String(cents).padStart(2, '0')}`;
    attempts += 1;
  } while (amount === excludeAmount && attempts < 12);

  return amount;
}

export function buildLiveWinItem(userPicker, gamePicker, lastItem) {
  const user = userPicker.next(lastItem?.usernamePrefix);
  const game = gamePicker.next(lastItem?.gameName);
  const action = LIVE_WIN_ACTIONS[randomBetween(0, LIVE_WIN_ACTIONS.length - 1)];
  const amount = pickUniqueAmount(lastItem?.amount);

  return {
    id: `${user}-${game.name}-${amount}-${Date.now()}`,
    username: `${user}****`,
    usernamePrefix: user,
    action,
    amount,
    name: game.name,
    gameName: game.name,
    image: game.image,
  };
}

export function isSlotsLiveWinPath(pathname) {
  return pathname === '/casino' || String(pathname || '').startsWith('/casino/');
}

/**
 * Build live-win candidates from the slots catalog cache (slot titles + icons).
 */
export function collectLiveWinSlotGamesFromCache(getCachedGames, providers) {
  const seen = new Set();
  const games = [];

  for (const provider of providers || []) {
    const list = getCachedGames?.(provider);
    if (!Array.isArray(list) || !list.length) continue;

    for (const game of list) {
      const name = String(game?.title || game?.name || '').trim();
      if (!name) continue;

      const image = String(
        game?.image ||
          game?.displayImage ||
          (Array.isArray(game?.iconUrls) ? game.iconUrls[0] : '') ||
          ''
      ).trim();
      if (!image) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      games.push({ name, image });
      if (games.length >= 80) return games;
    }
  }

  return games;
}
