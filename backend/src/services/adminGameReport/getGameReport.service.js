'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { getGamesList: getGitslotparkGamesList } = require('../gitslotpark/getGamesList.service');
const { GIT_SLOTPARK_PROVIDERS } = require('../gitslotpark/gitslotpark.config');
const { SLOTS_CATEGORY_GAMES } = require('../../constants/slotsCategoryGames');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const ORDER_BY_WHITELIST = new Set([
  'game_id',
  'game_name',
  'provider',
  'category',
  'sc_wagered',
  'sc_won',
  'ggr',
  'payout'
]);

const CATEGORY_LABELS = {
  'live-casino': 'Live Casino',
  casino: 'Casino',
  fishing: 'Fishing',
  slots: 'Slots',
  shooting: 'Shooting',
  'crash-game': 'Crash Game',
  'table-games': 'Table Games',
  'instant-win': 'Instant Win',
  keno: 'Keno',
  'scratch-cards': 'Scratch Cards',
  lottery: 'Lottery',
  plinko: 'Plinko',
  'video-poker': 'Video Poker',
  'casual-games': 'Casual Games',
  sports: 'Sports',
  bingo: 'Bingo',
  others: 'Others'
};

const CATEGORY_ALIASES = {
  table: 'table-games',
  'table-games': 'table-games',
  fishing: 'fishing',
  fish: 'fishing',
  'fish-game': 'fishing',
  'fish-games': 'fishing',
  crash: 'crash-game',
  'crash-game': 'crash-game',
  instant: 'instant-win',
  'instant-win': 'instant-win',
  keno: 'keno',
  shooting: 'shooting',
  live: 'live-casino',
  'live-casino': 'live-casino',
  casino: 'casino',
  scratch: 'scratch-cards',
  'scratch-cards': 'scratch-cards',
  bingo: 'bingo',
  lottery: 'lottery',
  plinko: 'plinko',
  poker: 'video-poker',
  'video-poker': 'video-poker',
  casual: 'casual-games',
  'casual-games': 'casual-games',
  slot: 'slots',
  slots: 'slots',
  sport: 'sports',
  sports: 'sports',
  sportsbook: 'sports',
  other: 'others',
  others: 'others'
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function payoutPct(wagered, won) {
  const w = num(wagered);
  if (w <= 0) return null;
  return Math.round((num(won) / w) * 10000) / 100;
}

function providerLabelFor(provider) {
  if (provider === 'bona') return 'Bona Games';
  if (provider === 'onegamehub') return '1GameHub';
  if (provider === 'win568') return 'Win568';
  if (provider === 'scorpio') return 'Scorpio Play';
  return 'GitSlotPark';
}

function titleCaseSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCategoryId(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '');
  if (!slug) return 'slots';
  return CATEGORY_ALIASES[slug] || slug;
}

function categoryLabelFor(categoryId) {
  const id = normalizeCategoryId(categoryId);
  return CATEGORY_LABELS[id] || titleCaseSlug(id) || 'Slots';
}

function categoryFromCatalogGame(game, provider) {
  if (provider === 'onegamehub') {
    const raw = Array.isArray(game?.categories) && game.categories[0]
      ? game.categories[0]
      : (game?.category || game?.type);
    return normalizeCategoryId(raw || 'slots');
  }
  if (provider === 'bona') {
    const type = String(game?.type || game?.gameType || game?.category || '').toLowerCase();
    if (type.includes('fish')) return 'fishing';
    return 'slots';
  }
  if (provider === 'win568') {
    const portfolio = String(game?.portfolio || '').toLowerCase();
    const type = String(game?.gameType || game?.type || '').toLowerCase();
    if (portfolio.includes('sport') || type.includes('sport')) return 'sports';
    if (portfolio.includes('casino') || type.includes('casino')) return 'live-casino';
    if (portfolio.includes('virtual')) return 'others';
    return 'slots';
  }
  const type = String(game?.type || game?.category || game?.gameType || '').toLowerCase();
  if (type.includes('fish')) return 'fishing';
  if (type) return normalizeCategoryId(type);
  return 'slots';
}

function categoryFromName(name) {
  const hay = String(name || '').toLowerCase();
  if (hay.includes('fishing') || /\bfish\b/.test(hay)) return 'fishing';
  if (hay.includes('roulette') || hay.includes('blackjack') || hay.includes('baccarat')) return 'table-games';
  if (hay.includes('crash')) return 'crash-game';
  if (hay.includes('keno')) return 'keno';
  if (hay.includes('plinko')) return 'plinko';
  if (hay.includes('poker')) return 'video-poker';
  if (hay.includes('scratch')) return 'scratch-cards';
  if (hay.includes('bingo')) return 'bingo';
  if (hay.includes('live casino') || hay.includes('live-casino')) return 'live-casino';
  return null;
}

function setGameMeta(gamesMap, provider, gameId, name, categoryId) {
  if (gameId == null || String(gameId).trim() === '') return;
  const key = `${provider}:${String(gameId)}`;
  const existing = gamesMap[key] && typeof gamesMap[key] === 'object' ? gamesMap[key] : {};
  gamesMap[key] = {
    name: name || existing.name || null,
    categoryId: categoryId || existing.categoryId || 'slots'
  };
}

function normalizeProviderKey(provider) {
  const key = String(provider || 'all').trim().toLowerCase();
  if (key === '1gamehub' || key === 'one_game_hub' || key === 'gamehub1') return 'onegamehub';
  if (key === '568win' || key === 'win568') return 'win568';
  if (key === 'scorpioplay' || key === 'scorpio_play' || key === 'scorpio-play') return 'scorpio';
  return key || 'all';
}

function includeGspProvider(providerKey) {
  return providerKey === 'all' || providerKey === 'gitslotpark' || providerKey === 'bona';
}

function includeOghProvider(providerKey) {
  return providerKey === 'all' || providerKey === 'onegamehub';
}

function includeWin568Provider(providerKey) {
  return providerKey === 'all' || providerKey === 'win568';
}

function includeScorpioProvider(providerKey) {
  return providerKey === 'all' || providerKey === 'scorpio';
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function resolveDateRange(startDate, endDate, timezoneOffset) {
  const normalizedStart =
    startDate && String(startDate).trim() && String(startDate).trim() !== 'undefined'
      ? String(startDate).trim()
      : null;
  const normalizedEnd =
    endDate && String(endDate).trim() && String(endDate).trim() !== 'undefined'
      ? String(endDate).trim()
      : null;
  const defaults = defaultDateRange();
  const rangeStart = normalizedStart || defaults.startDate;
  const rangeEnd = normalizedEnd || defaults.endDate;
  return {
    rangeStart,
    rangeEnd,
    from: toDateRangeStart(rangeStart, timezoneOffset),
    to: toDateRangeEnd(rangeEnd, timezoneOffset)
  };
}

function scopeSql(scope, replacements, userAlias = 'u') {
  const parts = [];
  if (scope?.storeCode) {
    replacements.filterStoreCode = String(scope.storeCode).trim();
    parts.push(`AND ${userAlias}.store_code = :filterStoreCode`);
  }
  if (scope?.distributorCode) {
    replacements.filterDistributorCode = String(scope.distributorCode).trim();
    parts.push(`AND ${userAlias}.distributor_code = :filterDistributorCode`);
  }
  return parts.join('\n      ');
}

function gspProviderSql(providerKey) {
  if (providerKey === 'bona') {
    return `AND LOWER(COALESCE(gt.provider, '')) = 'bona'`;
  }
  if (providerKey === 'gitslotpark') {
    return `AND LOWER(COALESCE(gt.provider, '')) NOT IN ('bona', 'win568', '568win')`;
  }
  return `AND LOWER(COALESCE(gt.provider, '')) NOT IN ('win568', '568win')`;
}

function catalogGameId(game) {
  const raw = game?.gameid ?? game?.gameId ?? game?.id;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

function gitslotparkListReq(req, provider) {
  return {
    user: req?.user,
    headers: {
      ...(req?.headers || {}),
      'x-gitslotpark-provider': provider
    },
    query: {
      store_code: req?.query?.store_code || req?.query?.storeCode || req?.storeCode,
      storeCode: req?.query?.storeCode || req?.query?.store_code || req?.storeCode
    },
    body: {}
  };
}

function addGitslotparkGamesToMap(gamesMap, games) {
  if (!Array.isArray(games)) return;
  for (const g of games) {
    const gId = catalogGameId(g);
    const gName = g?.name || g?.title || g?.gameName;
    if (gId != null) {
      setGameMeta(gamesMap, 'gitslotpark', gId, gName, categoryFromCatalogGame(g, 'gitslotpark'));
    }
  }
}

async function loadGitslotparkCatalogs(req, gamesMap) {
  await Promise.all(GIT_SLOTPARK_PROVIDERS.map(async (provider) => {
    try {
      const { games } = await getGitslotparkGamesList(gitslotparkListReq(req, provider));
      addGitslotparkGamesToMap(gamesMap, games);
    } catch (_) {
      /* catalog is optional enrichment */
    }
  }));

  for (const g of SLOTS_CATEGORY_GAMES) {
    if (g.provider !== 'gitslotpark' || !g.gameid || !g.title) continue;
    setGameMeta(gamesMap, 'gitslotpark', g.gameid, g.title, 'slots');
  }
}

async function buildGamesMap(req) {
  const gamesMap = {};
  await loadGitslotparkCatalogs(req, gamesMap);

  try {
    const bona = require('../bona');
    if (bona.isBonaConfigured()) {
      const { games } = await bona.getGamesList({});
      if (Array.isArray(games)) {
        for (const g of games) {
          const gId = g.id ?? g.gameId ?? g.gameid;
          const gName = g.name || g.nameLang || g.nameCn || g.title || g.gameName;
          if (gId != null) {
            setGameMeta(gamesMap, 'bona', gId, gName, categoryFromCatalogGame(g, 'bona'));
          }
        }
      }
    }
  } catch (_) {
    /* optional */
  }

  try {
    const ogh = require('../onegamehub/getGamesList.service');
    const storeCode = String(req?.storeCode || req?.query?.storeCode || '').trim();
    const { games } = await ogh.getGamesList(storeCode);
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.id ?? g.gameId ?? g.gameid;
        const gName = g.name || g.title || g.gameName;
        if (gId != null) {
          setGameMeta(gamesMap, 'onegamehub', gId, gName, categoryFromCatalogGame(g, 'onegamehub'));
        }
      }
    }
  } catch (_) {
    /* optional */
  }

  try {
    const win568 = require('../win568/getGamesList.service');
    const { games } = await win568.getGamesList();
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.gameId ?? g.gameid ?? g.id;
        const gName = g.name || g.gameName || g.title;
        if (gId != null) {
          setGameMeta(gamesMap, 'win568', gId, gName, categoryFromCatalogGame(g, 'win568'));
        }
      }
    }
  } catch (_) {
    /* optional */
  }

  try {
    const scorpio = require('../scorpioplay/getGamesList.service');
    const { games } = await scorpio.getGamesList();
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.gameCode || g.gameId || g.id;
        const gName = g.name || g.title || g.gameName;
        if (gId != null && gName) gamesMap[`scorpio:${String(gId)}`] = String(gName);
      }
    }
  } catch (_) {
    /* optional */
  }

  return gamesMap;
}

function gameMeta(gamesMap, provider, gameId) {
  if (gameId == null || gameId === '') return null;
  const meta = gamesMap[`${provider}:${gameId}`];
  if (meta && typeof meta === 'object') return meta;
  if (typeof meta === 'string') return { name: meta, categoryId: 'slots' };
  return null;
}

function resolveGameName(gamesMap, provider, gameId) {
  if (gameId == null || gameId === '') return providerLabelFor(provider);
  const meta = gameMeta(gamesMap, provider, gameId);
  return meta?.name || `Game ${gameId}`;
}

function resolveGameCategory(gamesMap, provider, gameId, gameName) {
  const meta = gameMeta(gamesMap, provider, gameId);
  if (meta?.categoryId) return normalizeCategoryId(meta.categoryId);
  return categoryFromName(gameName) || 'slots';
}

async function queryGspRows({ from, to, scope, providerKey }) {
  if (!db.GitslotparkTransaction) return [];
  const replacements = { from, to, userRole: ROLES.USER };
  const sql = `
    SELECT
      CAST(gt.game_id AS TEXT) AS game_id,
      CASE
        WHEN LOWER(COALESCE(gt.provider, '')) IN ('win568', '568win') THEN 'win568'
        WHEN LOWER(COALESCE(gt.provider, '')) = 'bona' THEN 'bona'
        ELSE 'gitslotpark'
      END AS provider,
      COALESCE(SUM(CASE
        WHEN LOWER(gt.operation) = 'withdraw' THEN gt.amount
        WHEN LOWER(gt.operation) = 'betwin' THEN COALESCE(gt.bet_amount, 0)
        ELSE 0
      END), 0)::float AS sc_wagered,
      COALESCE(SUM(CASE
        WHEN LOWER(gt.operation) = 'deposit' THEN gt.amount
        WHEN LOWER(gt.operation) = 'betwin' THEN COALESCE(gt.win_amount, 0)
        ELSE 0
      END), 0)::float AS sc_won,
      COUNT(*) FILTER (WHERE LOWER(gt.operation) IN ('withdraw', 'betwin'))::int AS bet_count,
      COUNT(DISTINCT gt.user_id)::int AS user_count
    FROM gitslotpark_transactions gt
    INNER JOIN users u ON u.user_id = gt.user_id
    WHERE u.role = :userRole
      AND LOWER(COALESCE(gt.status, '')) = 'completed'
      AND LOWER(gt.operation) IN ('withdraw', 'deposit', 'betwin')
      AND gt.created_at >= :from
      AND gt.created_at <= :to
      ${scopeSql(scope, replacements)}
      ${gspProviderSql(providerKey)}
    GROUP BY 1, 2
  `;
  try {
    return await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (_) {
    return [];
  }
}

async function queryOghRows({ from, to, scope }) {
  if (!db.OneGameHubTransaction) return [];
  const replacements = { from, to, userRole: ROLES.USER };
  const sql = `
    SELECT
      CAST(ogh.game_id AS TEXT) AS game_id,
      'onegamehub' AS provider,
      COALESCE(SUM(CASE WHEN LOWER(ogh.operation) = 'bet' THEN ogh.amount ELSE 0 END), 0)::float AS sc_wagered,
      COALESCE(SUM(CASE WHEN LOWER(ogh.operation) = 'win' THEN ogh.amount ELSE 0 END), 0)::float AS sc_won,
      COUNT(*) FILTER (WHERE LOWER(ogh.operation) = 'bet')::int AS bet_count,
      COUNT(DISTINCT ogh.user_id)::int AS user_count
    FROM one_game_hub_transactions ogh
    INNER JOIN users u ON u.user_id = ogh.user_id
    WHERE u.role = :userRole
      AND LOWER(COALESCE(ogh.status, '')) = 'completed'
      AND LOWER(ogh.operation) IN ('bet', 'win')
      AND ogh.created_at >= :from
      AND ogh.created_at <= :to
      ${scopeSql(scope, replacements)}
    GROUP BY 1, 2
  `;
  try {
    return await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (_) {
    return [];
  }
}

async function queryWin568Rows({ from, to, scope }) {
  if (!db.Win568Bet) return [];
  const replacements = { from, to, userRole: ROLES.USER };
  const sql = `
    SELECT
      CAST(COALESCE(wb.game_type, wb.product_type, 0) AS TEXT) AS game_id,
      'win568' AS provider,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(wb.status, '')) <> 'void' THEN wb.stake ELSE 0 END), 0)::float AS sc_wagered,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(wb.status, '')) = 'settled' THEN GREATEST(COALESCE(wb.winloss, 0), 0) ELSE 0 END), 0)::float AS sc_won,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(wb.status, '')) <> 'void')::int AS bet_count,
      COUNT(DISTINCT wb.user_id)::int AS user_count
    FROM win568_bets wb
    INNER JOIN users u ON u.user_id = wb.user_id
    WHERE u.role = :userRole
      AND wb.created_at >= :from
      AND wb.created_at <= :to
      ${scopeSql(scope, replacements)}
    GROUP BY 1, 2
  `;
  try {
    return await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (_) {
    return [];
  }
}

async function queryScorpioRows({ from, to, scope }) {
  if (!db.ScorpioTransaction) return [];
  const replacements = { from, to, userRole: ROLES.USER };
  const sql = `
    SELECT
      CAST(st.game_code AS TEXT) AS game_id,
      'scorpio' AS provider,
      COALESCE(SUM(CASE WHEN LOWER(st.command) = 'bet' THEN st.amount ELSE 0 END), 0)::float AS sc_wagered,
      COALESCE(SUM(CASE WHEN LOWER(st.command) = 'win' THEN st.amount ELSE 0 END), 0)::float AS sc_won,
      COUNT(*) FILTER (WHERE LOWER(st.command) = 'bet')::int AS bet_count,
      COUNT(DISTINCT st.user_id)::int AS user_count
    FROM scorpio_transactions st
    INNER JOIN users u ON u.user_id = st.user_id
    WHERE u.role = :userRole
      AND LOWER(COALESCE(st.status, '')) = 'completed'
      AND LOWER(st.command) IN ('bet', 'win')
      AND st.created_at >= :from
      AND st.created_at <= :to
      ${scopeSql(scope, replacements)}
    GROUP BY 1
  `;
  try {
    return await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (_) {
    return [];
  }
}

function mapGameRow(row, gamesMap) {
  const provider = String(row.provider || 'gitslotpark').toLowerCase();
  const gameId = row.game_id != null && String(row.game_id).trim() !== '' ? String(row.game_id) : null;
  const scWagered = round2(row.sc_wagered);
  const scWon = round2(row.sc_won);
  const ggr = round2(scWagered - scWon);
  const gameName = resolveGameName(gamesMap, provider, gameId);
  const categoryId = resolveGameCategory(gamesMap, provider, gameId, gameName);
  return {
    gameId,
    gameName,
    provider,
    providerLabel: providerLabelFor(provider),
    categoryId,
    categoryLabel: categoryLabelFor(categoryId),
    scWagered,
    scWon,
    ggr,
    payout: payoutPct(scWagered, scWon),
    betCount: Math.max(0, Math.round(num(row.bet_count))),
    userCount: Math.max(0, Math.round(num(row.user_count)))
  };
}

function aggregateByProvider(gameRows) {
  const byProvider = new Map();
  for (const row of gameRows) {
    const key = row.provider || 'gitslotpark';
    const current = byProvider.get(key) || {
      gameId: key,
      gameName: providerLabelFor(key),
      provider: key,
      providerLabel: providerLabelFor(key),
      scWagered: 0,
      scWon: 0,
      ggr: 0,
      payout: null,
      betCount: 0,
      userCount: 0
    };
    current.scWagered = round2(current.scWagered + row.scWagered);
    current.scWon = round2(current.scWon + row.scWon);
    current.betCount += row.betCount;
    current.userCount += row.userCount;
    byProvider.set(key, current);
  }
  return [...byProvider.values()].map((row) => ({
    ...row,
    ggr: round2(row.scWagered - row.scWon),
    payout: payoutPct(row.scWagered, row.scWon)
  }));
}

function aggregateByCategory(gameRows) {
  const byCategory = new Map();
  for (const row of gameRows) {
    const key = row.categoryId || 'slots';
    const current = byCategory.get(key) || {
      gameId: key,
      gameName: categoryLabelFor(key),
      provider: key,
      providerLabel: categoryLabelFor(key),
      categoryId: key,
      categoryLabel: categoryLabelFor(key),
      scWagered: 0,
      scWon: 0,
      ggr: 0,
      payout: null,
      betCount: 0,
      userCount: 0,
      gameCount: 0
    };
    current.scWagered = round2(current.scWagered + row.scWagered);
    current.scWon = round2(current.scWon + row.scWon);
    current.betCount += row.betCount;
    current.userCount += row.userCount;
    current.gameCount += 1;
    byCategory.set(key, current);
  }
  return [...byCategory.values()].map((row) => ({
    ...row,
    ggr: round2(row.scWagered - row.scWon),
    payout: payoutPct(row.scWagered, row.scWon)
  }));
}

function matchesSearch(row, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return (
    String(row.gameId || '').toLowerCase().includes(q) ||
    String(row.gameName || '').toLowerCase().includes(q) ||
    String(row.providerLabel || '').toLowerCase().includes(q) ||
    String(row.provider || '').toLowerCase().includes(q) ||
    String(row.categoryLabel || '').toLowerCase().includes(q) ||
    String(row.categoryId || '').toLowerCase().includes(q)
  );
}

function compareRows(a, b, orderBy, direction) {
  const dir = direction === 'ASC' ? 1 : -1;
  const key = ORDER_BY_WHITELIST.has(orderBy) ? orderBy : 'sc_wagered';
  const valueOf = (row) => {
    if (key === 'game_id') return String(row.gameId || '');
    if (key === 'game_name') return String(row.gameName || '');
    if (key === 'provider') return String(row.providerLabel || row.provider || '');
    if (key === 'category') return String(row.categoryLabel || row.categoryId || '');
    if (key === 'sc_wagered') return num(row.scWagered);
    if (key === 'sc_won') return num(row.scWon);
    if (key === 'ggr') return num(row.ggr);
    if (key === 'payout') return row.payout == null ? -1 : num(row.payout);
    return 0;
  };
  const av = valueOf(a);
  const bv = valueOf(b);
  if (typeof av === 'string' || typeof bv === 'string') {
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp * dir;
  } else if (av !== bv) {
    return (av - bv) * dir;
  }
  return String(a.gameId || '').localeCompare(String(b.gameId || '')) * dir;
}

function buildSummary(rows) {
  const scWagered = round2(rows.reduce((sum, row) => sum + num(row.scWagered), 0));
  const scWon = round2(rows.reduce((sum, row) => sum + num(row.scWon), 0));
  return {
    gameCount: rows.length,
    scWagered,
    scWon,
    ggr: round2(scWagered - scWon),
    payout: payoutPct(scWagered, scWon),
    betCount: rows.reduce((sum, row) => sum + num(row.betCount), 0)
  };
}

/**
 * Per-game, per-provider, or per-category SC wagered / won report.
 * GC is intentionally omitted — partner-platform slots settle in SC only.
 */
async function getGameReport({
  req = null,
  scope = {},
  startDate = null,
  endDate = null,
  timezoneOffset = null,
  tab = 'game',
  search = null,
  provider = 'all',
  page = 1,
  limit = DEFAULT_LIMIT,
  orderBy = 'sc_wagered',
  orderDirection = 'DESC'
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const offset = (pageNum - 1) * limitNum;
  const rawTab = String(tab || 'game').toLowerCase();
  const tabKey = rawTab === 'provider' || rawTab === 'category' ? rawTab : 'game';
  const providerKey = normalizeProviderKey(provider);
  const sortKey = ORDER_BY_WHITELIST.has(String(orderBy || '').toLowerCase())
    ? String(orderBy).toLowerCase()
    : 'sc_wagered';
  const sortDir = String(orderDirection || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const { rangeStart, rangeEnd, from, to } = resolveDateRange(startDate, endDate, timezoneOffset);

  if (!from || !to) {
    return {
      rows: [],
      summary: buildSummary([]),
      total: 0,
      page: pageNum,
      limit: limitNum,
      totalPages: 1,
      tab: tabKey,
      startDate: rangeStart,
      endDate: rangeEnd
    };
  }

  const wantGsp = includeGspProvider(providerKey);
  const wantOgh = includeOghProvider(providerKey);
  const wantWin568 = includeWin568Provider(providerKey);
  const wantScorpio = includeScorpioProvider(providerKey);

  const [gspRows, oghRows, win568Rows, scorpioRows, gamesMap] = await Promise.all([
    wantGsp ? queryGspRows({ from, to, scope, providerKey }) : Promise.resolve([]),
    wantOgh ? queryOghRows({ from, to, scope }) : Promise.resolve([]),
    wantWin568 ? queryWin568Rows({ from, to, scope }) : Promise.resolve([]),
    wantScorpio ? queryScorpioRows({ from, to, scope }) : Promise.resolve([]),
    buildGamesMap(req)
  ]);

  let rows = [...gspRows, ...oghRows, ...win568Rows, ...scorpioRows]
    .map((row) => mapGameRow(row, gamesMap))
    .filter((row) => num(row.scWagered) !== 0 || num(row.scWon) !== 0);
  if (tabKey === 'provider') rows = aggregateByProvider(rows);
  if (tabKey === 'category') rows = aggregateByCategory(rows);
  rows = rows.filter((row) => matchesSearch(row, search));
  rows.sort((a, b) => compareRows(a, b, sortKey, sortDir));

  const summary = buildSummary(rows);
  const total = rows.length;
  const paged = rows.slice(offset, offset + limitNum);

  return {
    rows: paged,
    summary,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    tab: tabKey,
    startDate: rangeStart,
    endDate: rangeEnd
  };
}

module.exports = { getGameReport };
