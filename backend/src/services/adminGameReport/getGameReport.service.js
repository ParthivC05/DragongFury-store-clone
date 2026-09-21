'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { getGamesList: getGitslotparkGamesList } = require('../gitslotpark/getGamesList.service');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const ORDER_BY_WHITELIST = new Set([
  'game_id',
  'game_name',
  'provider',
  'currency',
  'sc_wagered',
  'sc_won',
  'ggr',
  'payout'
]);

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

async function buildGamesMap(req) {
  const gamesMap = {};
  try {
    const { games } = await getGitslotparkGamesList(req || {});
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.id ?? g.gameId ?? g.gameid;
        const gName = g.name || g.title || g.gameName;
        if (gId != null && gName) gamesMap[`gitslotpark:${String(gId)}`] = String(gName);
      }
    }
  } catch (_) {
    /* catalog is optional enrichment */
  }

  try {
    const bona = require('../bona');
    if (bona.isBonaConfigured()) {
      const { games } = await bona.getGamesList({});
      if (Array.isArray(games)) {
        for (const g of games) {
          const gId = g.id ?? g.gameId ?? g.gameid;
          const gName = g.name || g.nameLang || g.nameCn || g.title || g.gameName;
          if (gId != null && gName) gamesMap[`bona:${String(gId)}`] = String(gName);
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
        if (gId != null && gName) gamesMap[`onegamehub:${String(gId)}`] = String(gName);
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

function resolveGameName(gamesMap, provider, gameId) {
  if (gameId == null || gameId === '') return providerLabelFor(provider);
  const key = `${provider}:${gameId}`;
  return gamesMap[key] || `Game ${gameId}`;
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
      'SC' AS currency,
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
    GROUP BY 1, 2, 3
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
      CASE
        WHEN UPPER(COALESCE(ogh.metadata->>'currency', 'SSC')) IN ('GOC', 'GC') THEN 'GC'
        ELSE 'SC'
      END AS currency,
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
    GROUP BY 1, 2, 3
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
      'SC' AS currency,
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
    GROUP BY 1, 2, 3
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
  const currency = String(row.currency || 'SC').trim().toUpperCase() === 'GC' ? 'GC' : 'SC';
  const gameId = row.game_id != null && String(row.game_id).trim() !== '' ? String(row.game_id) : null;
  const scWagered = round2(row.sc_wagered);
  const scWon = round2(row.sc_won);
  const ggr = round2(scWagered - scWon);
  return {
    gameId,
    gameName: resolveGameName(gamesMap, provider, gameId),
    provider,
    providerLabel: providerLabelFor(provider),
    currency,
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
    const currency = row.currency === 'GC' ? 'GC' : 'SC';
    const key = `${row.provider || 'gitslotpark'}:${currency}`;
    const current = byProvider.get(key) || {
      gameId: key,
      gameName: providerLabelFor(row.provider || 'gitslotpark'),
      provider: row.provider || 'gitslotpark',
      providerLabel: providerLabelFor(row.provider || 'gitslotpark'),
      currency,
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

function matchesSearch(row, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return (
    String(row.gameId || '').toLowerCase().includes(q) ||
    String(row.gameName || '').toLowerCase().includes(q) ||
    String(row.providerLabel || '').toLowerCase().includes(q) ||
    String(row.provider || '').toLowerCase().includes(q)
  );
}

function compareRows(a, b, orderBy, direction) {
  const dir = direction === 'ASC' ? 1 : -1;
  const key = ORDER_BY_WHITELIST.has(orderBy) ? orderBy : 'sc_wagered';
  const valueOf = (row) => {
    if (key === 'game_id') return String(row.gameId || '');
    if (key === 'game_name') return String(row.gameName || '');
    if (key === 'provider') return String(row.providerLabel || row.provider || '');
    if (key === 'currency') return String(row.currency || 'SC');
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
  const scRows = rows.filter((row) => row.currency !== 'GC');
  const gcRows = rows.filter((row) => row.currency === 'GC');
  const scWagered = round2(scRows.reduce((sum, row) => sum + num(row.scWagered), 0));
  const scWon = round2(scRows.reduce((sum, row) => sum + num(row.scWon), 0));
  const gcWagered = round2(gcRows.reduce((sum, row) => sum + num(row.scWagered), 0));
  const gcWon = round2(gcRows.reduce((sum, row) => sum + num(row.scWon), 0));
  return {
    gameCount: rows.length,
    scWagered,
    scWon,
    ggr: round2(scWagered - scWon),
    payout: payoutPct(scWagered, scWon),
    gcWagered,
    gcWon,
    gcGgr: round2(gcWagered - gcWon),
    gcPayout: payoutPct(gcWagered, gcWon),
    betCount: rows.reduce((sum, row) => sum + num(row.betCount), 0)
  };
}

/**
 * Per-game (or per-provider) wagered / won report.
 * 1GameHub Gold Coin play is a separate GC currency row so it is never mixed with SC.
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
  const tabKey = String(tab || 'game').toLowerCase() === 'provider' ? 'provider' : 'game';
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
