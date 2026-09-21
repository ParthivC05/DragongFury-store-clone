'use strict';

const SCORPIO_POPULAR_SLOT_NAMES = require('./scorpioPopularSlots');
const { isHiddenBrokenProviderGame } = require('./hiddenBrokenGames');

/** Curated Slots category: GitSlotPark only, ranked by live play (12 Aug–12 Sept). */
const SLOTS_CATEGORY_GAMES = [
  { provider: 'gitslotpark', gameid: '33', title: 'Hip Hop Panda' },
  { provider: 'gitslotpark', gameid: '104', title: 'Wild Bandito' },
  { provider: 'gitslotpark', gameid: '36', title: 'Prosperity Lion' },
  { provider: 'gitslotpark', gameid: '29', title: 'Dragon Legend' },
  { provider: 'gitslotpark', gameid: '3', title: 'Fortune Gods' },
  { provider: 'gitslotpark', gameid: '60', title: 'Leprechaun Riches' },
  { provider: 'gitslotpark', gameid: '37', title: "Santa's Gift Rush" },
  { provider: 'gitslotpark', gameid: '82', title: 'Phoenix Rises' },
  { provider: 'gitslotpark', gameid: '54', title: 'Captain Bounty' },
  { provider: 'gitslotpark', gameid: '1', title: 'Honey Trap Of Diao Chan' },
  { provider: 'gitslotpark', gameid: '83', title: 'Wild Fireworks' },
  { provider: 'gitslotpark', gameid: '7', title: 'Medusa' },
  { provider: 'gitslotpark', gameid: '1473388', title: 'Cruise Royale' },
  { provider: 'gitslotpark', gameid: '35', title: 'Mr. Hallow-Win' },
  { provider: 'gitslotpark', gameid: '25', title: 'Plushie Frenzy' },
  { provider: 'gitslotpark', gameid: '4704' },
  { provider: 'gitslotpark', gameid: '85', title: 'Ganesha Gold' },
  { provider: 'gitslotpark', gameid: '6', title: 'Medusa II' },
  { provider: 'gitslotpark', gameid: '75', title: 'Candy Burst' },
  { provider: 'gitslotpark', gameid: '108', title: 'Buffalo Win' },
  { provider: 'gitslotpark', gameid: '4528' },
  { provider: 'gitslotpark', gameid: '4516' },
  { provider: 'gitslotpark', gameid: '105', title: 'Heist Stakes' },
  { provider: 'gitslotpark', gameid: '42', title: 'Gem Saviour Sword' },
  { provider: 'gitslotpark', gameid: '48', title: 'Double Fortune' },
  { provider: 'gitslotpark', gameid: '126', title: 'Forge of Wealth' },
  { provider: 'gitslotpark', gameid: '1695365' },
  { provider: 'gitslotpark', gameid: '73', title: "Egypt's Book of Mystery" },
  { provider: 'gitslotpark', gameid: '121', title: 'Destined for Riches' },
  { provider: 'gitslotpark', gameid: '1381200' },
  { provider: 'gitslotpark', gameid: '4629' },
  { provider: 'gitslotpark', gameid: '117', title: 'Cocktail Nights' },
  { provider: 'gitslotpark', gameid: '123', title: 'Rooster Rumble' },
  { provider: 'gitslotpark', gameid: '87', title: 'Treasures of Aztec' },
  { provider: 'gitslotpark', gameid: '34', title: 'Legend of Hou Yi' }
];

const GITSLOTPARK_SLOT_IDS = new Set(
  SLOTS_CATEGORY_GAMES.filter((game) => game.provider === 'gitslotpark').map((game) => String(game.gameid))
);

const ONEGAMEHUB_SLOT_IDS = new Set(
  SLOTS_CATEGORY_GAMES.filter((game) => game.provider === 'onegamehub').map((game) =>
    String(game.gameid).toLowerCase()
  )
);

const SLOT_CATEGORY_ALIASES = new Set(['slot', 'slots']);

function catalogGameId(game) {
  return String(game?.id ?? game?.gameId ?? game?.gameid ?? game?.game_id ?? '').trim();
}

function recentlyPlayedGameId(row) {
  return String(row?.gameId ?? row?.game_id ?? row?.id ?? '').trim();
}

function oneGameHubCategoryId(game) {
  const raw =
    (Array.isArray(game?.categories) && game.categories[0]) ||
    game?.category ||
    game?.type ||
    'slots';
  return String(raw || 'slots')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, '-')
    .replace(/\s+/g, '-');
}

function isOneGameHubSlotCategory(game) {
  const slug = oneGameHubCategoryId(game);
  return !slug || SLOT_CATEGORY_ALIASES.has(slug);
}

function filterGitslotparkUserGames(games, provider) {
  if (!Array.isArray(games)) return [];
  const allowlisted = [];
  const extras = [];
  for (const game of games) {
    if (isHiddenBrokenProviderGame(game)) continue;
    if (GITSLOTPARK_SLOT_IDS.has(catalogGameId(game))) allowlisted.push(game);
    else extras.push(game);
  }
  return [...allowlisted, ...extras.slice(0, 20)];
}

function filterGitslotparkRecentlyPlayed(games) {
  if (!Array.isArray(games)) return [];
  return games.filter(
    (row) => GITSLOTPARK_SLOT_IDS.has(recentlyPlayedGameId(row)) && !isHiddenBrokenProviderGame(row)
  );
}

function filterOneGameHubUserGames(games) {
  if (!Array.isArray(games)) return [];
  const visible = games.filter((game) => !isHiddenBrokenProviderGame(game));
  if (ONEGAMEHUB_SLOT_IDS.size === 0) return visible;
  return visible.filter((game) => {
    if (!isOneGameHubSlotCategory(game)) return true;
    return ONEGAMEHUB_SLOT_IDS.has(catalogGameId(game).toLowerCase());
  });
}

function compactSlotTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function isScorpioPgSoftStudio(game = {}) {
  const hay = [
    game.providerName,
    game.brand,
    game.studio,
    game.provider
  ]
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .join(' ');
  return hay.includes('pgsoft') || hay.includes('pocketgames');
}

function isScorpioSlotGame(game) {
  if (isScorpioPgSoftStudio(game)) return false;
  const type = Number(game?.gameType);
  if (Number.isFinite(type)) return type === 0;
  const label = String(game?.gameTypeLabel || '').trim().toLowerCase();
  return !label || label === 'slots' || label === 'slot';
}

const SCORPIO_LOBBY_TITLES = [
  ...SCORPIO_POPULAR_SLOT_NAMES,
  ...SLOTS_CATEGORY_GAMES.map((game) => game.title)
]
  .map(compactSlotTitle)
  .filter(Boolean);

function matchesScorpioLobbyTitle(game) {
  const title = compactSlotTitle(game?.name || game?.gameName || game?.title);
  if (!title) return false;
  for (const needle of SCORPIO_LOBBY_TITLES) {
    if (title === needle) return true;
    const shortest = Math.min(title.length, needle.length);
    if (shortest < 10) continue;
    if (title.includes(needle) || needle.includes(title)) return true;
  }
  return false;
}

function filterScorpioUserGames(games) {
  if (!Array.isArray(games)) return [];
  return games.filter(
    (game) => String(game?.gameCode || game?.gameId || '').trim() && !isHiddenBrokenProviderGame(game)
  );
}

module.exports = {
  SLOTS_CATEGORY_GAMES,
  GITSLOTPARK_SLOT_IDS,
  ONEGAMEHUB_SLOT_IDS,
  filterGitslotparkUserGames,
  filterGitslotparkRecentlyPlayed,
  filterOneGameHubUserGames,
  filterScorpioUserGames
};
