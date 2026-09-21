'use strict';

const SCORPIO_POPULAR_SLOT_NAMES = require('./scorpioPopularSlots');

/** Curated Slots category returned on user-side lobby APIs. */
const SLOTS_CATEGORY_GAMES = [
  { provider: 'gitslotpark', gameid: '33', title: 'Hip Hop Panda' },
  { provider: 'gitslotpark', gameid: '104', title: 'Wild Bandito' },
  { provider: 'gitslotpark', gameid: '3', title: 'Fortune Gods' },
  { provider: 'gitslotpark', gameid: '36', title: 'Prosperity Lion' },
  { provider: 'gitslotpark', gameid: '29', title: 'Dragon Legend' },
  { provider: 'onegamehub', gameid: 'kagaming2-flaming-7s', title: "Flaming 7's" },
  { provider: 'gitslotpark', gameid: '60', title: 'Leprechaun Riches' },
  { provider: 'gitslotpark', gameid: '1', title: 'Honey Trap Of Diao Chan' },
  { provider: 'onegamehub', gameid: 'kagaming2-IrishCoins', title: 'Irish Coins Lock 2 Spin' },
  { provider: 'gitslotpark', gameid: '35', title: 'Mr. Hallow-Win' },
  { provider: 'onegamehub', gameid: 'kagaming2-bonus-mania', title: 'Bonus Mania' },
  { provider: 'gitslotpark', gameid: '82', title: 'Phoenix Rises' },
  { provider: 'onegamehub', gameid: 'kagaming2-BonusManiaPlinko', title: 'Bonus Mania Plinko' },
  { provider: 'gitslotpark', gameid: '1473388', title: 'Cruise Royale' },
  { provider: 'gitslotpark', gameid: '54', title: 'Captain Bounty' },
  { provider: 'onegamehub', gameid: 'eagaming-2', title: 'Bagua' },
  { provider: 'gitslotpark', gameid: '37', title: "Santa's Gift Rush" },
  { provider: 'gitslotpark', gameid: '83', title: 'Wild Fireworks' },
  { provider: 'gitslotpark', gameid: '25', title: 'Plushie Frenzy' },
  { provider: 'gitslotpark', gameid: '7', title: 'Medusa' }
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
  const key = String(provider || '').trim().toLowerCase();
  if (key && key !== 'pgsoft' && key !== 'gitslotpark') return [];
  if (!Array.isArray(games)) return [];
  const allowlisted = [];
  const extras = [];
  for (const game of games) {
    if (GITSLOTPARK_SLOT_IDS.has(catalogGameId(game))) allowlisted.push(game);
    else extras.push(game);
  }
  return [...allowlisted, ...extras.slice(0, 20)];
}

function filterGitslotparkRecentlyPlayed(games) {
  if (!Array.isArray(games)) return [];
  return games.filter((row) => GITSLOTPARK_SLOT_IDS.has(recentlyPlayedGameId(row)));
}

function filterOneGameHubUserGames(games) {
  if (!Array.isArray(games)) return [];
  const kept = [];
  let extraSlots = 0;
  for (const game of games) {
    if (!isOneGameHubSlotCategory(game)) {
      kept.push(game);
      continue;
    }
    if (ONEGAMEHUB_SLOT_IDS.has(catalogGameId(game).toLowerCase())) {
      kept.push(game);
      continue;
    }
    if (extraSlots < 35) {
      kept.push(game);
      extraSlots += 1;
    }
  }
  return kept;
}

function compactSlotTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function isScorpioSlotGame(game) {
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
  return games.filter((game) => String(game?.gameCode || game?.gameId || '').trim());
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
