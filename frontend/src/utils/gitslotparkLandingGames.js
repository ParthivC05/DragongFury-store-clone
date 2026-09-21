import { SLOTS_CATEGORY_GAMES } from '../config/slotsCategoryGames';
import { SCORPIO_POPULAR_SLOT_NAMES } from '../config/scorpioPopularSlots';
import { isScorpioPlayProvider } from '../config/scorpio';
import { ONEGAMEHUB_FISHING_GAMES } from '../config/onegamehubFishingGames';
import {
  ONEGAMEHUB_TOP_FISHING_GAMES,
  TOP_FISHING_GAMES_COUNT,
} from '../config/onegamehubTopFishingGames';
import {
  GITSLOTPARK_TOP_GAMES,
  ONEGAMEHUB_TOP_GAMES,
  TOP_GAMES_COUNT,
} from '../config/topLobbyGames';
import { ONEGAMEHUB_TABLE_GAMES } from '../config/onegamehubTableGames';
import { ONEGAMEHUB_INSTANT_WIN_GAMES } from '../config/onegamehubInstantWinGames';
import { ONEGAMEHUB_SCRATCH_CARD_GAMES } from '../config/onegamehubScratchCardGames';
import { GIT_SLOTPARK_PROVIDERS } from '../config/gitslotpark';
import { getSlotLocalIcon } from '../config/slotLocalIcons';

const GAME_PLACEHOLDER = '/logo.webp';
const IMAGE_SHAPE_TOLERANCE = 0.12;
const BLOCKED_ONEGAMEHUB_BRANDS = ['mrslotty', 'netgame', '7777gaming', 'spinoro'];

export function isGenericGameImage(url) {
  const value = String(url || '').trim().toLowerCase();
  if (!value || value === '/' || value === GAME_PLACEHOLDER.toLowerCase()) return true;
  if (value.includes('[object object]')) return true;
  return value.includes('gamevault');
}

const imageShapeCache = new Map();

export function extractGitslotparkGamesList(res) {
  if (Array.isArray(res?.games)) return res.games;
  if (Array.isArray(res?.data?.games)) return res.data.games;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

export function getGitslotparkIconUrls(game) {
  return [
    game.iconurl,
    game.iconUrl,
    game.iconurl1,
    game.iconUrl1,
    game.iconurl2,
    game.iconUrl2,
    game.image,
    game.thumbnail,
  ]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url && !isGenericGameImage(url));
}

function classifyImageShape(width, height) {
  if (!width || !height) return 'unknown';
  const ratio = width / height;
  if (ratio > 1 + IMAGE_SHAPE_TOLERANCE) return 'landscape';
  if (ratio < 1 - IMAGE_SHAPE_TOLERANCE) return 'portrait';
  return 'square';
}

function probeImageShape(url) {
  if (!url || isGenericGameImage(url)) {
    return Promise.resolve('unknown');
  }

  const cached = imageShapeCache.get(url);
  if (cached) return cached;

  const pending = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(classifyImageShape(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => resolve('unknown');
    img.src = url;
  }).then((shape) => {
    imageShapeCache.set(url, Promise.resolve(shape));
    return shape;
  });

  imageShapeCache.set(url, pending);
  return pending;
}

async function resolveGameImages(game) {
  const iconUrls = [...new Set(game.iconUrls)];
  const shapedIcons = await Promise.all(
    iconUrls.map(async (url) => ({ url, shape: await probeImageShape(url) }))
  );

  const squareIcon = shapedIcons.find((entry) => entry.shape === 'square');
  const portraitIcon = shapedIcons.find((entry) => entry.shape === 'portrait');
  const displayIcon = squareIcon || portraitIcon;

  return {
    ...game,
    displayImage: displayIcon?.url || null,
    imageShape: displayIcon?.shape || null,
  };
}

export async function enrichGamesWithImageShapes(games) {
  const uniqueUrls = [...new Set(games.flatMap((game) => game.iconUrls))];
  await Promise.all(uniqueUrls.map((url) => probeImageShape(url)));
  return Promise.all(games.map((game) => resolveGameImages(game)));
}

export function mapGitslotparkToCarouselGame(game, provider) {
  const iconUrls = getGitslotparkIconUrls(game);
  const image = iconUrls[0] || '';

  const rawGameId = game.gameid ?? game.gameId ?? game.id;
  const gameid =
    rawGameId != null && String(rawGameId).trim() !== '' ? rawGameId : null;

  return {
    id: `${provider}-${gameid ?? game.symbol ?? game.name}`,
    gameid,
    provider,
    symbol: String(game.symbol || gameid || game.name || '').trim().toLowerCase(),
    title: game.name || 'Game',
    image,
    iconUrls,
  };
}

/** Map Bona gameList item → carousel game (provider = bona). */
export function mapBonaToCarouselGame(game) {
  const rawGameId = game.id ?? game.gameId ?? game.gameid;
  const gameid =
    rawGameId != null && String(rawGameId).trim() !== '' ? Number(rawGameId) : null;

  const iconUrls = [
    game.squareIcon,
    game.portraitIcon,
    game.rectangleIcon,
    game.loadingPic,
  ]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url && url !== '/' && !isGenericGameImage(url));

  const title =
    game.name ||
    game.nameLang ||
    game.nameEn ||
    game.nameCn ||
    'Bona Game';

  return {
    id: `bona-${gameid ?? title}`,
    gameid,
    provider: 'bona',
    symbol: String(gameid || title).trim().toLowerCase(),
    title,
    image: iconUrls[0] || '',
    iconUrls,
    gameType: game.type || null,
  };
}

export function mapWin568ToCarouselGame(game) {
  const rawGameId = game.gameId ?? game.gameid ?? game.GameId;
  const gameid =
    rawGameId != null && String(rawGameId).trim() !== '' ? Number(rawGameId) : null;
  const rawGpId = Number(game.gpId ?? game.gpid ?? game.GameProviderId ?? game.GpId);
  // 0 is a real 568Win provider id (WanMei). Only default when the field is missing.
  const gpId = Number.isFinite(rawGpId) ? rawGpId : 10000;
  const icon = typeof game.icon === 'string' ? game.icon.trim() : '';
  const title = game.name || game.gameName || 'Game';

  return {
    id: `win568-${game.portfolio || 'SeamlessGame'}-${gpId}-${gameid ?? title}`,
    gameid,
    gpId,
    portfolio: game.portfolio || 'SeamlessGame',
    provider: 'win568',
    symbol: String(gameid || title).trim().toLowerCase(),
    title,
    image: icon && icon.startsWith('http') ? icon : '',
    iconUrls: icon && icon.startsWith('http') ? [icon] : [],
    gameType: game.gameType || null,
  };
}

/**
 * Keep every launchable Bona title (including missing icons → placeholder).
 */
export function prepareBonaSlotGames(games) {
  return dedupeCarouselGames(games)
    .filter((game) => game.gameid != null && Number(game.gameid) > 0)
    .map((game) => {
      const image = getCarouselImage(game) || GAME_PLACEHOLDER;
      const iconUrls =
        Array.isArray(game.iconUrls) && game.iconUrls.length
          ? game.iconUrls
          : [image];
      return {
        ...game,
        image,
        iconUrls,
      };
    });
}

export function isBonaFishingGame(game) {
  return String(game?.gameType || '').toLowerCase() === 'fishing' || isFishingThemedGame(game);
}

/**
 * Merge Bona titles into an existing lobby: fishing first, slots into Classic Casino.
 */
export function appendBonaToSlotCategories(categories = [], allGames = []) {
  const bonaGames = prepareBonaSlotGames(
    (allGames || []).filter((g) => g.provider === 'bona')
  );
  const bonaFishing = bonaGames.filter(isBonaFishingGame);
  const bonaSlots = bonaGames.filter((g) => !isBonaFishingGame(g));
  let next = Array.isArray(categories) ? [...categories] : [];

  if (bonaFishing.length) {
    next = [
      {
        id: 'fishing-games',
        label: 'Top Fishing games',
        games: bonaFishing,
        ranked: false,
      },
      ...next.filter((c) => c.id !== 'fishing-games'),
    ];
  }

  if (bonaSlots.length) {
    const classicIdx = next.findIndex((c) => c.id === 'classic-slots');
    if (classicIdx >= 0) {
      const classic = next[classicIdx];
      next = next.map((category, index) =>
        index === classicIdx
          ? {
              ...classic,
              games: [...classic.games, ...bonaSlots],
              grid: true,
            }
          : category
      );
    } else {
      next = [
        ...next,
        {
          id: 'classic-slots',
          label: 'Classic Casino',
          games: bonaSlots,
          ranked: false,
          grid: true,
        },
      ];
    }
  }

  return next;
}

/**
 * No separate Bona row:
 * - Top Fishing games = Bona fishing only (shown first)
 * - Other-provider fishing → Classic Slots
 * - Bona slots → Classic Slots (after other providers)
 */
export function buildDashboardSlotCategoriesWithBona(allGames, options = {}) {
  const otherGames = (allGames || []).filter((g) => g.provider !== 'bona');
  const categories = buildDashboardSlotCategories(otherGames, {
    ...options,
    // Keep Fishing for Bona only; fold other-provider fishing into Classic Slots.
    foldFishingIntoClassic: true,
  });
  return appendBonaToSlotCategories(categories, allGames);
}

function normalizeOneGameHubBrand(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isBlockedOneGameHubBrand(game) {
  const haystacks = [game?.brand, game?.brandId, game?.brand_id, game?.provider, game?.id, game?.gameid, game?.alias]
    .map(normalizeOneGameHubBrand)
    .filter(Boolean);

  return haystacks.some((value) =>
    BLOCKED_ONEGAMEHUB_BRANDS.some((blocked) => value === blocked || value.startsWith(blocked))
  );
}

export function isGrazGameBrand(game) {
  const haystacks = [game?.brand, game?.brandId, game?.brand_id, game?.id, game?.gameid, game?.alias]
    .map(normalizeOneGameHubBrand)
    .filter(Boolean);

  return haystacks.some(
    (value) => value === 'grazgame' || value === 'grazgames' || value.startsWith('grazgame')
  );
}

/** Map 1GameHub live catalog item → carousel game (provider = onegamehub). */
export function mapOneGameHubToCarouselGame(game) {
  const rawGameId = game.gameid ?? game.gameId ?? game.id;
  const gameid =
    rawGameId != null && String(rawGameId).trim() !== '' ? String(rawGameId).trim() : null;

  const iconUrls = [
    ...(Array.isArray(game.iconUrls) ? game.iconUrls : []),
    game.image,
    game.icon,
    game.thumbnail,
  ]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url && url !== '/' && !isGenericGameImage(url));

  const title = game.name || game.title || game.alias || '1GameHub Game';

  return {
    id: `onegamehub-${gameid ?? title}`,
    gameid,
    provider: 'onegamehub',
    symbol: String(gameid || title).trim().toLowerCase(),
    title,
    image: iconUrls[0] || GAME_PLACEHOLDER,
    iconUrls: iconUrls.length ? iconUrls.slice(0, 4) : [GAME_PLACEHOLDER],
    brand: game.brand || '',
    categories: Array.isArray(game.categories) ? game.categories : [],
  };
}

/** Lobby category order. */
export const ORIONSTAR_CATEGORY_ORDER = [
  { id: 'live-casino', label: 'Live Casino' },
  { id: 'fishing', label: 'Fishing' },
  { id: 'slots', label: 'Slots' },
  { id: 'others', label: 'Other' },
  { id: 'bingo', label: 'Bingo' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'crash-game', label: 'Crash Game' },
  { id: 'table-games', label: 'Table Games' },
  { id: 'instant-win', label: 'Instant Win' },
  { id: 'keno', label: 'Keno' },
  { id: 'scratch-cards', label: 'Scratch Cards' },
  { id: 'lottery', label: 'Lottery' },
  { id: 'plinko', label: 'Plinko' },
  { id: 'video-poker', label: 'Video Poker' },
  { id: 'casual-games', label: 'Casual Games' },
];

export const HIDDEN_SLOT_CATEGORY_IDS = new Set([
  'bingo',
  'virtual',
  'virtual-game',
  'virtual-games',
  'virtualgames',
  'popular',
  'popular-games',
  'buffalo-blast',
  'buffalo',
]);

export function isHiddenSlotCategoryId(categoryId) {
  const id = normalizeSlotCategoryId(categoryId);
  if (!id) return false;
  if (HIDDEN_SLOT_CATEGORY_IDS.has(id)) return true;
  return id.startsWith('virtual');
}

const HUB_SLUG_TO_CATEGORY_ID = {
  table: 'table-games',
  'table-games': 'table-games',
  fishing: 'fishing',
  crash: 'crash-game',
  'crash-game': 'crash-game',
  instant: 'instant-win',
  'instant-win': 'instant-win',
  keno: 'keno',
  shooting: 'shooting',
  live: 'live-casino',
  'live-casino': 'live-casino',
  scratch: 'scratch-cards',
  'scratch-cards': 'scratch-cards',
  bingo: 'bingo',
  lottery: 'lottery',
  plinko: 'plinko',
  poker: 'video-poker',
  'video-poker': 'video-poker',
  casual: 'casual-games',
  'casual-games': 'casual-games',
  other: 'others',
  others: 'others',
  'other-games': 'others',
  virtual: 'virtual-games',
  'virtual-game': 'virtual-games',
  'virtual-games': 'virtual-games',
  virtualgames: 'virtual-games',
  slot: 'slots',
  slots: 'slots',
};

function isOneGameHubProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'onegamehub' || value === '1gamehub';
}

function isGitslotparkProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'gitslotpark' || GIT_SLOTPARK_PROVIDERS.includes(value);
}

function indexGitslotparkGames(allGames) {
  const byId = new Map();
  for (const game of allGames || []) {
    if (!isGitslotparkProvider(game?.provider)) continue;
    const id = String(game.gameid ?? '').trim();
    if (id && !byId.has(id)) byId.set(id, game);
    const lower = id.toLowerCase();
    if (lower && !byId.has(lower)) byId.set(lower, game);
  }
  return byId;
}

function indexOneGameHubGames(allGames) {
  const byId = new Map();
  for (const game of allGames || []) {
    if (!isOneGameHubProvider(game?.provider)) continue;
    if (isBlockedOneGameHubBrand(game)) continue;
    const id = String(game.gameid || game.id || '').trim().toLowerCase();
    if (id && !byId.has(id)) byId.set(id, game);
  }
  return byId;
}


function isScorpioProvider(provider) {
  return isScorpioPlayProvider(provider);
}

export function isScorpioSlotLobbyGame(game = {}) {
  if (!isScorpioProvider(game.provider)) return false;
  const type = Number(game.gameType);
  if (Number.isFinite(type)) return type === 0;
  const label = String(game.gameTypeLabel || '').trim().toLowerCase();
  return !label || label === 'slots' || label === 'slot';
}

export function isScorpioLobbyGame(game = {}) {
  return isScorpioProvider(game.provider) && Boolean(game.gameid || game.gameCode);
}

function compactSlotTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function scorpioTitleMatches(game, title) {
  const needle = compactSlotTitle(title);
  const candidate = compactSlotTitle(game?.title || game?.name);
  if (!needle || !candidate) return false;
  if (candidate === needle) return true;
  const shortest = Math.min(candidate.length, needle.length);
  if (shortest < 10) return false;
  return candidate.startsWith(needle) || needle.startsWith(candidate);
}

function findScorpioSlotByTitle(slots, title) {
  if (!Array.isArray(slots) || !title) return null;
  return slots.find((game) => scorpioTitleMatches(game, title)) || null;
}

function pickScorpioIconUrl(icon) {
  if (typeof icon === 'string') {
    const text = icon.trim();
    if (text.startsWith('http') && !text.includes('[object Object]')) return text;
    return '';
  }
  if (!icon || typeof icon !== 'object') return '';
  const preferred = ['url', 'src', 'href', 'image', 'icon', 'en', 'default', '216x160'];
  for (const key of preferred) {
    const found = pickScorpioIconUrl(icon[key]);
    if (found) return found;
  }
  for (const nested of Object.values(icon)) {
    const found = pickScorpioIconUrl(nested);
    if (found) return found;
  }
  return '';
}

export function mapScorpioToCarouselGame(game) {
  const gameCode = String(game.gameCode || game.gameId || game.gameid || '').trim();
  const providerId = Number(game.providerId);
  const icon = pickScorpioIconUrl(game.icon);
  const title = game.name || game.gameName || game.title || 'Game';
  const gameType = Number(game.gameType);
  const gameTypeLabel =
    game.gameTypeLabel ||
    (gameType === 1 ? 'Live Casino' : gameType === 2 ? 'Other' : 'Slots');

  const localIcon = getSlotLocalIcon(title);
  const remoteIcon = icon && icon.startsWith('http') && !isGenericGameImage(icon) ? icon : '';
  const image = remoteIcon || localIcon || GAME_PLACEHOLDER;

  return {
    id: `scorpio-${Number.isFinite(providerId) ? providerId : 0}-${gameCode || title}`,
    gameid: gameCode || null,
    gameCode,
    providerId: Number.isFinite(providerId) ? providerId : null,
    provider: 'scorpio',
    providerName: game.providerName || '',
    brand: game.brand || game.providerName || '',
    studio: game.studio || '',
    symbol: (gameCode || title).toLowerCase(),
    title,
    name: title,
    image,
    iconUrls: image === GAME_PLACEHOLDER ? [GAME_PLACEHOLDER] : [image],
    gameType: Number.isFinite(gameType) ? gameType : 0,
    gameTypeLabel,
  };
}

function isScorpioPgSoftStudio(game = {}) {
  const hay = [
    game.providerName,
    game.brand,
    game.studio,
    game.provider,
  ]
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .join(' ');
  return hay.includes('pgsoft') || hay.includes('pocketgames');
}

export function isScorpioBuffaloNamedGame(game = {}) {
  if (!isScorpioProvider(game.provider)) return false;
  if (isScorpioPgSoftStudio(game)) return false;
  const hay = `${game.title || ''} ${game.name || ''} ${game.gameName || ''}`;
  return /\bbuffalo\b/i.test(hay);
}

export function buildBuffaloBlastCategory(allGames) {
  const games = dedupeCarouselGames((allGames || []).filter(isScorpioBuffaloNamedGame));
  if (!games.length) return null;
  return { id: 'buffalo-blast', label: 'Buffalo Blast', games, ranked: false };
}

export function pickScorpioLobbySlotGames(allGames) {
  const slots = (allGames || []).filter(isScorpioSlotLobbyGame);
  if (!slots.length) return [];

  const unmatched = [...slots];
  const ranked = [];
  const seen = new Set();

  for (const popularName of SCORPIO_POPULAR_SLOT_NAMES) {
    const needle = compactSlotTitle(popularName);
    if (!needle) continue;
    const index = unmatched.findIndex((game) => {
      const title = compactSlotTitle(game.title || game.name);
      if (!title) return false;
      if (title === needle) return true;
      const shortest = Math.min(title.length, needle.length);
      if (shortest < 10) return false;
      return title.includes(needle) || needle.includes(title);
    });
    if (index < 0) continue;
    const [found] = unmatched.splice(index, 1);
    const id = gameCatalogId(found) || found.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ranked.push(found);
  }

  return ranked;
}

const OTHER_CATEGORY_LIMIT = 70;

function uniqueLobbyKey(game) {
  const provider = String(game?.provider || '').trim().toLowerCase();
  if (provider === 'scorpio') {
    return String(game?.id || `scorpio-${game?.providerId || 0}-${game?.gameid || game?.gameCode || ''}`)
      .trim()
      .toLowerCase();
  }
  return String(game?.gameid || game?.id || '')
    .trim()
    .toLowerCase();
}

function isOneGameHubSlotGame(game) {
  if (!isOneGameHubProvider(game?.provider)) return false;
  const raw =
    (Array.isArray(game.categories) && game.categories[0]) || game.category || 'slots';
  const slug = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return !slug || slug === 'slot' || slug === 'slots';
}

export function buildOtherLobbyCategory(allGames, occupiedGames = []) {
  const occupiedIds = new Set();
  for (const game of occupiedGames || []) {
    const id = uniqueLobbyKey(game);
    if (id) occupiedIds.add(id);
  }

  const pushUnique = (pool, limit = Infinity) => {
    const games = [];
    const seen = new Set();
    const seenTitles = new Set();
    for (const game of pool) {
      if (games.length >= limit) break;
      const id = uniqueLobbyKey(game);
      const title = compactSlotTitle(game?.title || game?.name);
      if (!id || seen.has(id) || occupiedIds.has(id)) continue;
      if (title && seenTitles.has(title)) continue;
      seen.add(id);
      if (title) seenTitles.add(title);
      games.push(game);
    }
    return games;
  };

  const scorpioGames = pushUnique((allGames || []).filter(isScorpioLobbyGame), OTHER_CATEGORY_LIMIT);
  const gspSlots = (allGames || []).filter((game) => isGitslotparkProvider(game?.provider));
  const hubSlots = (allGames || []).filter(isOneGameHubSlotGame);
  const filler =
    scorpioGames.length >= OTHER_CATEGORY_LIMIT
      ? []
      : pushUnique([...gspSlots, ...hubSlots], OTHER_CATEGORY_LIMIT - scorpioGames.length);
  const games = [...scorpioGames, ...filler];
  if (!games.length) return null;
  return { id: 'others', label: 'Other', games, ranked: false };
}

export function buildCuratedSlotsCategory(allGames) {
  const gspById = indexGitslotparkGames(allGames);
  const oghById = indexOneGameHubGames(allGames);
  const scorpioSlots = (allGames || []).filter(isScorpioSlotLobbyGame);
  const games = [];
  const seen = new Set();
  const seenTitles = new Set();

  const pushGame = (game, title) => {
    const compact = compactSlotTitle(title || game?.title || game?.name);
    if (compact && seenTitles.has(compact)) return;
    if (!pushUniqueLobbyGame(games, seen, game, title)) return;
    if (compact) seenTitles.add(compact);
  };

  for (const spec of SLOTS_CATEGORY_GAMES) {
    const scorpio = findScorpioSlotByTitle(scorpioSlots, spec.title);
    if (scorpio) {
      pushGame(scorpio, spec.title);
      continue;
    }
    const key = String(spec.gameid || '').trim();
    if (!key) continue;
    const found =
      String(spec.provider || '').toLowerCase() === 'onegamehub'
        ? oghById.get(key.toLowerCase())
        : gspById.get(key) || gspById.get(key.toLowerCase());
    if (found) pushGame(found, spec.title);
  }

  for (const game of pickScorpioLobbySlotGames(allGames)) {
    pushGame(game, game.title);
  }

  if (!games.length) return null;
  return { id: 'slots', label: 'Slots', games, ranked: false };
}

export function buildOneGameHubSlotsCategory(allGames) {
  return buildCuratedSlotsCategory(allGames);
}

function gameCatalogId(game) {
  return String(game?.gameid || game?.id || '')
    .trim()
    .toLowerCase();
}

function isOneGameHubFishingTitle(game) {
  if (!isOneGameHubProvider(game?.provider) || isBlockedOneGameHubBrand(game)) return false;
  const cats = Array.isArray(game.categories) ? game.categories.join(' ') : '';
  return String(cats).toLowerCase().includes('fishing');
}

const ONEGAMEHUB_FISHING_GAME_IDS = new Set(
  [...ONEGAMEHUB_FISHING_GAMES, ...ONEGAMEHUB_TOP_FISHING_GAMES]
    .map((spec) => String(spec.gameid || '').trim().toLowerCase())
    .filter(Boolean)
);

const FISHING_LOBBY_CATEGORY_IDS = new Set(['fishing', 'top-fishing', 'fishing-games']);

function normalizeOneGameHubGameId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^onegamehub-/, '');
}

/** True for 1GameHub fishing-category titles (curated lists, catalog, or lobby row). */
export function isOneGameHubFishingPlayGame(game = {}) {
  if (game?.isFishing === true || game?.isFishing === '1' || game?.isFishing === 1) return true;

  const provider = String(game.provider || '').trim().toLowerCase();
  if (provider && !isOneGameHubProvider(provider)) return false;

  const lobbyCategory = String(game.lobbyCategoryId || game.categoryId || '')
    .trim()
    .toLowerCase();
  if (FISHING_LOBBY_CATEGORY_IDS.has(lobbyCategory)) return true;

  const gameId = normalizeOneGameHubGameId(game.gameid || game.gameId || game.id);
  if (gameId && ONEGAMEHUB_FISHING_GAME_IDS.has(gameId)) return true;
  if (gameId.includes('fishing')) return true;

  const cats = Array.isArray(game.categories)
    ? game.categories.join(' ')
    : String(game.categories || '');
  if (String(cats).toLowerCase().includes('fishing')) return true;

  const name = String(game.name || game.title || '').toLowerCase();
  if (name.includes('fishing')) return true;

  return false;
}

function pushUniqueLobbyGame(games, seen, game, title) {
  const id = gameCatalogId(game);
  if (!id || seen.has(id)) return false;
  seen.add(id);
  const displayTitle = title || game.title;
  const image =
    (game.image && !isGenericGameImage(game.image) ? game.image : null) ||
    getSlotLocalIcon(displayTitle) ||
    getSlotLocalIcon(game.title) ||
    GAME_PLACEHOLDER;
  games.push({
    ...game,
    title: displayTitle,
    image,
    iconUrls: image === GAME_PLACEHOLDER ? [GAME_PLACEHOLDER] : [image],
  });
  return true;
}

function fillFishingFromCatalog(allGames, games, seen, limit) {
  for (const game of allGames || []) {
    if (games.length >= limit) break;
    if (!isOneGameHubFishingTitle(game)) continue;
    pushUniqueLobbyGame(games, seen, game);
  }
}

/**
 * Ranked Top 10 fishing row. Does not replace the Fishing category.
 * Prefers the curated list, then fills from live fishing titles so the row always has 10.
 */
export function buildOneGameHubTopFishingCategory(allGames) {
  const byId = indexOneGameHubGames(allGames);
  const games = [];
  const seen = new Set();

  for (const spec of ONEGAMEHUB_TOP_FISHING_GAMES) {
    if (games.length >= TOP_FISHING_GAMES_COUNT) break;
    const found = byId.get(String(spec.gameid).trim().toLowerCase());
    if (found) pushUniqueLobbyGame(games, seen, found, spec.title);
  }

  fillFishingFromCatalog(allGames, games, seen, TOP_FISHING_GAMES_COUNT);

  if (!games.length) return null;
  return {
    id: 'top-fishing',
    label: 'Top 10 fishing games',
    games: games.slice(0, TOP_FISHING_GAMES_COUNT),
    ranked: true,
  };
}

function collectExcludeIds(values) {
  const ids = new Set();
  for (const value of values || []) {
    const id = String(value || '')
      .trim()
      .toLowerCase();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Ranked Top 10 games row.
 * GitSlotPark when that provider is enabled in admin; otherwise 1GameHub.
 * Never includes titles already used in Top 10 fishing.
 */
export function buildTopGamesCategory(allGames, options = {}, excludeIds = new Set()) {
  const exclude = collectExcludeIds([
    ...excludeIds,
    ...ONEGAMEHUB_TOP_FISHING_GAMES.map((spec) => spec.gameid),
  ]);
  const games = [];
  const seen = new Set();
  const useGitslotpark = options.gitslotpark === true;
  const useOnegamehub = options.onegamehub === true;

  const pushGame = (game, title) => {
    const id = gameCatalogId(game);
    const rawId = String(game?.gameid ?? '').trim().toLowerCase();
    if (!id || seen.has(id) || exclude.has(id) || (rawId && exclude.has(rawId))) return false;
    return pushUniqueLobbyGame(games, seen, game, title);
  };

  if (useGitslotpark) {
    const byId = indexGitslotparkGames(allGames);
    for (const spec of GITSLOTPARK_TOP_GAMES) {
      if (games.length >= TOP_GAMES_COUNT) break;
      const key = String(spec.gameid || '').trim();
      const found = byId.get(key) || byId.get(key.toLowerCase());
      if (found) pushGame(found, spec.title || found.title);
    }
    for (const game of allGames || []) {
      if (games.length >= TOP_GAMES_COUNT) break;
      if (!isGitslotparkProvider(game?.provider)) continue;
      pushGame(game);
    }
  } else if (useOnegamehub) {
    const byId = indexOneGameHubGames(allGames);
    for (const spec of ONEGAMEHUB_TOP_GAMES) {
      if (games.length >= TOP_GAMES_COUNT) break;
      const found = byId.get(String(spec.gameid).trim().toLowerCase());
      if (found) pushGame(found, spec.title);
    }
    for (const game of allGames || []) {
      if (games.length >= TOP_GAMES_COUNT) break;
      if (!isOneGameHubProvider(game?.provider) || isBlockedOneGameHubBrand(game)) continue;
      if (isOneGameHubFishingTitle(game)) continue;
      pushGame(game);
    }
  }

  if (!games.length) return null;
  return {
    id: 'top-games',
    label: 'Top 10 games',
    games: games.slice(0, TOP_GAMES_COUNT),
    ranked: true,
  };
}

export function buildOneGameHubFishingCategory(allGames, excludeIds = new Set()) {
  const byId = indexOneGameHubGames(allGames);
  const games = [];
  const seen = new Set(
    [...excludeIds].map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
  );

  for (const spec of ONEGAMEHUB_FISHING_GAMES) {
    const found = byId.get(String(spec.gameid).trim().toLowerCase());
    if (!found) continue;
    pushUniqueLobbyGame(games, seen, found, spec.title);
  }

  fillFishingFromCatalog(allGames, games, seen, ONEGAMEHUB_FISHING_GAMES.length);

  if (!games.length) return null;
  return { id: 'fishing', label: 'Fishing', games, ranked: false };
}

export function buildOneGameHubTableGamesCategory(allGames) {
  return pickCuratedOneGameHubCategory(allGames, ONEGAMEHUB_TABLE_GAMES, 'table-games', 'Table Games');
}

export function buildOneGameHubInstantWinCategory(allGames) {
  return pickCuratedOneGameHubCategory(allGames, ONEGAMEHUB_INSTANT_WIN_GAMES, 'instant-win', 'Instant Win');
}

export function buildOneGameHubLiveCasinoCategory(allGames) {
  const games = [];
  const seen = new Set();
  for (const game of allGames || []) {
    if (!isOneGameHubProvider(game?.provider)) continue;
    if (isBlockedOneGameHubBrand(game)) continue;
    if (!isGrazGameBrand(game)) continue;
    const id = String(game.gameid || game.id || '').trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    games.push({
      ...game,
      image: game.image || GAME_PLACEHOLDER,
      iconUrls:
        Array.isArray(game.iconUrls) && game.iconUrls.length
          ? game.iconUrls
          : [game.image || GAME_PLACEHOLDER],
    });
  }
  if (!games.length) return null;
  return { id: 'live-casino', label: 'Live Casino', games, ranked: false };
}

export function buildOneGameHubScratchCardsCategory(allGames) {
  const curated = pickCuratedOneGameHubCategory(
    allGames,
    ONEGAMEHUB_SCRATCH_CARD_GAMES,
    'scratch-cards',
    'Scratch Cards'
  );
  if (curated?.games?.length) return curated;

  const extras = [];
  const seen = new Set();
  for (const game of allGames || []) {
    if (!isOneGameHubProvider(game?.provider)) continue;
    if (isBlockedOneGameHubBrand(game)) continue;
    const cats = Array.isArray(game.categories) ? game.categories.join(' ') : '';
    if (!String(cats).toLowerCase().includes('scratch')) continue;
    const id = String(game.gameid || '').trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    extras.push({
      ...game,
      image: game.image || GAME_PLACEHOLDER,
      iconUrls:
        Array.isArray(game.iconUrls) && game.iconUrls.length
          ? game.iconUrls
          : [game.image || GAME_PLACEHOLDER],
    });
    if (extras.length >= 28) break;
  }
  if (!extras.length) return null;
  return { id: 'scratch-cards', label: 'Scratch Cards', games: extras, ranked: false };
}

function pickCuratedOneGameHubCategory(allGames, specs, id, label) {
  const byId = indexOneGameHubGames(allGames);
  const games = [];
  for (const spec of specs) {
    const found = byId.get(String(spec.gameid).trim().toLowerCase());
    if (!found) continue;
    games.push({
      ...found,
      title: spec.title || found.title,
      image: found.image || GAME_PLACEHOLDER,
      iconUrls:
        Array.isArray(found.iconUrls) && found.iconUrls.length
          ? found.iconUrls
          : [found.image || GAME_PLACEHOLDER],
    });
  }
  if (!games.length) return null;
  return { id, label, games, ranked: false };
}

function titleCaseSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeSlotCategoryId(categoryId) {
  const raw = String(categoryId || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function getSlotCategoryLabel(categoryId) {
  const id = normalizeSlotCategoryId(categoryId);
  if (id === 'recently-played') return 'Recently Played';
  if (id === 'popular' || id === 'popular-games') return 'Popular Games';
  if (id === 'buffalo-blast' || id === 'buffalo') return 'Buffalo Blast';
  if (id === 'top-fishing') return 'Top 10 fishing games';
  if (id === 'top-games') return 'Top 10 games';
  const known = ORIONSTAR_CATEGORY_ORDER.find((item) => item.id === id);
  return known?.label || titleCaseSlug(id) || 'Games';
}

export function getSlotCategoryPath(categoryId) {
  return `/casino/${encodeURIComponent(normalizeSlotCategoryId(categoryId))}`;
}

function resolveOrionstarCategory(game) {
  if (!isOneGameHubProvider(game?.provider)) {
    return { id: 'slots', label: 'Slots' };
  }

  const raw =
    (Array.isArray(game.categories) && game.categories[0]) ||
    game.category ||
    'slots';
  const slug = String(raw).trim().toLowerCase().replace(/\s+/g, '-');
  const id = HUB_SLUG_TO_CATEGORY_ID[slug] || slug || 'slots';
  const known = ORIONSTAR_CATEGORY_ORDER.find((item) => item.id === id);
  return { id, label: known?.label || titleCaseSlug(id) || 'Slots' };
}

/** Short lobby label for compact UI (e.g. cross-sell game cards). */
export function getGameLobbyCategoryLabel(game) {
  const { id, label } = resolveOrionstarCategory(game);
  if (id === 'table-games') return 'Table';
  if (id === 'crash-game') return 'Crash';
  return label;
}

/**
 * Orionstars-style lobby:
 * 1GameHub games grouped by hub `categories[0]`, 1GameHub first in each row.
 * Slots category: fixed top-20 list only (GitSlotPark + 1GameHub).
 */
export function buildOrionstarSlotCategories(allGames, options = {}) {
  const eligible = prepareDashboardSlotGames(allGames || []).filter(
    (game) => String(game.provider || '').toLowerCase() !== 'bona'
  );
  const buckets = new Map();

  for (const game of eligible) {
    if (isGrazGameBrand(game)) continue;
        const { id, label } = resolveOrionstarCategory(game);
    if (isHiddenSlotCategoryId(id)) continue;
    if (!buckets.has(id)) {
      buckets.set(id, { id, label, hub: [], other: [] });
    }
    const bucket = buckets.get(id);
    if (isOneGameHubProvider(game.provider)) bucket.hub.push(game);
    else bucket.other.push(game);
  }

  const toCategory = (bucket) => {
    const games = [...bucket.hub, ...bucket.other];
    if (!games.length) return null;
    return { id: bucket.id, label: bucket.label, games, ranked: false };
  };

  const categories = [];
  const curatedTable = buildOneGameHubTableGamesCategory(allGames);
  const curatedTopFishing = buildOneGameHubTopFishingCategory(allGames);
  const topFishingIds = new Set(
    (curatedTopFishing?.games || []).map((game) => gameCatalogId(game)).filter(Boolean)
  );
  const curatedTopGames = buildTopGamesCategory(allGames, options, topFishingIds);
  const curatedFishing = buildOneGameHubFishingCategory(allGames, topFishingIds);
  const curatedInstantWin = buildOneGameHubInstantWinCategory(allGames);
  const curatedScratch = buildOneGameHubScratchCardsCategory(allGames);
  const curatedLiveCasino = buildOneGameHubLiveCasinoCategory(allGames);
  const curatedSlots = buildCuratedSlotsCategory(allGames);

  const pushCuratedOrBucket = (defId, curated) => {
    const bucket = buckets.get(defId);
    const other = (bucket?.other || []).filter((game) => !topFishingIds.has(gameCatalogId(game)));
    if (curated?.games?.length) {
      categories.push({
        ...curated,
        games: [...curated.games, ...other],
      });
    } else {
      const category = bucket ? toCategory(bucket) : null;
      if (category) {
        categories.push({
          ...category,
          games: (category.games || []).filter((game) => !topFishingIds.has(gameCatalogId(game))),
        });
      }
    }
    buckets.delete(defId);
  };

  for (const def of ORIONSTAR_CATEGORY_ORDER) {
    if (def.id === 'table-games') {
      pushCuratedOrBucket('table-games', curatedTable);
      continue;
    }
    if (def.id === 'fishing') {
      pushCuratedOrBucket('fishing', curatedFishing);
      continue;
    }
    if (def.id === 'slots') {
      if (curatedSlots?.games?.length) {
        categories.push(curatedSlots);
      }
      buckets.delete('slots');
      const buffaloBlast = buildBuffaloBlastCategory(allGames);
      if (buffaloBlast?.games?.length) categories.push(buffaloBlast);
      continue;
    }
    if (def.id === 'others') {
      buckets.delete('others');
      continue;
    }
    if (def.id === 'instant-win') {
      pushCuratedOrBucket('instant-win', curatedInstantWin);
      continue;
    }
    if (def.id === 'scratch-cards') {
      pushCuratedOrBucket('scratch-cards', curatedScratch);
      continue;
    }
    if (def.id === 'live-casino') {
      pushCuratedOrBucket('live-casino', curatedLiveCasino);
      continue;
    }
    const bucket = buckets.get(def.id);
    if (!bucket) continue;
    const category = toCategory(bucket);
    if (category) categories.push(category);
    buckets.delete(def.id);
  }


  if (curatedTopFishing?.games?.length) {
    const liveCasinoIndex = categories.findIndex((category) => category.id === 'live-casino');
    if (liveCasinoIndex >= 0) {
      categories.splice(liveCasinoIndex + 1, 0, curatedTopFishing);
    } else {
      categories.unshift(curatedTopFishing);
    }
  }

  if (curatedTopGames?.games?.length) {
    categories.unshift(curatedTopGames);
  }

  const occupied = categories.flatMap((category) => category.games || []);
  const otherCategory = buildOtherLobbyCategory(allGames, occupied);
  if (otherCategory?.games?.length) {
    const slotsIndex = categories.findIndex((category) => category.id === 'slots');
    if (slotsIndex >= 0) categories.splice(slotsIndex + 1, 0, otherCategory);
    else categories.push(otherCategory);
  }

  return categories;
}

export function resolveLaunchGameId(game) {
  const raw = game?.gameid ?? game?.gameId ?? game?.gameCode ?? game?.id;
  if (raw == null || String(raw).trim() === '') return null;
  const provider = String(game?.provider || '').trim().toLowerCase();
  if (provider === 'onegamehub' || provider === '1gamehub' || isScorpioPlayProvider(provider)) {
    return String(raw).trim();
  }
  if (provider === 'win568' || provider === '568win') {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

const FISHING_KEYWORDS = ['ocean', 'fish', 'fishing', 'shark'];

export function isFishingThemedGame(game) {
  const haystack = `${game.title || ''} ${game.symbol || ''}`.toLowerCase();
  return FISHING_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function getCarouselImage(game) {
  const current = game.image || game.displayImage || null;
  if (current && !isGenericGameImage(current)) return current;
  return getSlotLocalIcon(game.title || game.name) || current;
}

export function isEligibleDashboardSlotGame(game) {
  const provider = String(game?.provider || '').trim().toLowerCase();
  if (provider === 'onegamehub' || provider === '1gamehub') {
    return Boolean(game.gameid || game.gameId) && !isBlockedOneGameHubBrand(game);
  }
  if (isScorpioPlayProvider(provider)) {
    return Boolean(game.gameid || game.gameCode);
  }

  const urls = Array.isArray(game.iconUrls) && game.iconUrls.length
    ? game.iconUrls
    : [getCarouselImage(game)].filter(Boolean);

  return urls.some((url) => url && !isGenericGameImage(url));
}

/** Fast path for dashboard — uses mapped icon URLs, no remote image probing. */
export function prepareDashboardSlotGames(games) {
  return dedupeCarouselGames(games)
    .filter(isEligibleDashboardSlotGame)
    .map((game) => ({
      ...game,
      image: getCarouselImage(game),
    }));
}

export function dedupeCarouselGames(games) {
  const seenIds = new Set();
  const seenSymbols = new Set();
  const unique = [];

  for (const game of games) {
    const symbolKey = game.symbol || game.title.trim().toLowerCase();
    if (seenIds.has(game.id) || (symbolKey && seenSymbols.has(symbolKey))) continue;
    seenIds.add(game.id);
    if (symbolKey) seenSymbols.add(symbolKey);
    unique.push(game);
  }

  return unique;
}

export function prepareCarouselGames(games, limit) {
  return dedupeCarouselGames(games)
    .filter((game) => game.displayImage)
    .slice(0, limit)
    .map((game) => ({
      ...game,
      image: game.displayImage,
    }));
}

export function splitGamesIntoCategories(games, { topCount = 10, categoryCount = 25 } = {}) {
  return buildDashboardSlotCategories(games, { topCount, categoryCount });
}

export function buildDashboardSlotCategories(
  games,
  {
    topCount = 10,
    categoryCount = 25,
    foldFishingIntoClassic = false,
  } = {}
) {
  const eligible = prepareDashboardSlotGames(games);

  if (!eligible.length) {
    return [];
  }

  const usedIds = new Set();
  const categories = [];

  const pickGames = (pool, limit, id, label, ranked = false) => {
    const picked = [];
    for (const game of pool) {
      if (picked.length >= limit) break;
      if (usedIds.has(game.id)) continue;
      usedIds.add(game.id);
      picked.push(game);
    }
    if (picked.length) {
      categories.push({ id, label, games: picked, ranked });
    }
  };

  const fishingGames = eligible.filter((game) => isFishingThemedGame(game));
  // When folding into Classic Slots, keep fishing out of New/Top/Trending/Hot/Popular.
  const categoryPool = foldFishingIntoClassic
    ? eligible.filter((game) => !isFishingThemedGame(game))
    : eligible;

  const topGames = categoryPool.slice(0, topCount);
  const remaining = categoryPool.slice(topCount);
  const splitAt = Math.ceil(remaining.length / 2);
  const newPool = remaining.slice(0, splitAt);
  const trendingPool = remaining.slice(splitAt);

  pickGames(newPool, categoryCount, 'new-games', 'New Games');
  if (topGames.length) {
    topGames.forEach((game) => usedIds.add(game.id));
    categories.push({ id: 'top-games', label: 'Top 10 Games', games: topGames, ranked: true });
  }

  if (!foldFishingIntoClassic && fishingGames.length) {
    fishingGames.forEach((game) => usedIds.add(game.id));
    categories.unshift({
      id: 'fishing-games',
      label: 'Top Fishing games',
      games: fishingGames,
      ranked: false,
    });
  }

  pickGames(trendingPool, categoryCount, 'trending-games', 'Trending Games');

  const EXTRA_CATEGORY_LABELS = [
    { id: 'hot-games', label: 'Hot Games' },
    { id: 'popular-games', label: 'Popular Picks' },
    { id: 'classic-slots', label: 'Classic Casino' },
  ];

  const leftoversExcludingReservedFishing = () =>
    eligible.filter((game) => {
      if (usedIds.has(game.id)) return false;
      if (foldFishingIntoClassic && isFishingThemedGame(game)) return false;
      return true;
    });

  for (const { id, label } of EXTRA_CATEGORY_LABELS) {
    if (id === 'classic-slots') {
      const nonFishingLeft = leftoversExcludingReservedFishing();
      const fishingLeft = foldFishingIntoClassic
        ? eligible.filter((game) => !usedIds.has(game.id) && isFishingThemedGame(game))
        : [];
      pickGames([...nonFishingLeft, ...fishingLeft], Infinity, id, label);
      continue;
    }
    const limit = categoryCount;
    pickGames(leftoversExcludingReservedFishing(), limit, id, label);
  }

  return categories;
}

export { GAME_PLACEHOLDER };
