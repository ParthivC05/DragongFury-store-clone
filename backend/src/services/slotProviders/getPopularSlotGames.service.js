'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

function normalizeStoreCode(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProvider(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'bona') return 'bona';
  if (key === 'onegamehub' || key === '1gamehub') return 'onegamehub';
  if (key === 'scorpio' || key === 'scorpioplay' || key === 'scorpio_play') return 'scorpio';
  if (key === 'win568' || key === '568win') return 'win568';
  return 'gitslotpark';
}

async function queryRows(sql, replacements) {
  try {
    return await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (_) {
    return [];
  }
}

function mergePlayCounts(groups) {
  const byKey = new Map();
  for (const rows of groups) {
    for (const row of rows || []) {
      const gameId = row.game_id != null ? String(row.game_id).trim() : '';
      if (!gameId) continue;
      const provider = normalizeProvider(row.provider);
      if (provider === 'win568') continue;
      const key = `${provider}:${gameId}`;
      const playCount = Math.max(0, Math.round(Number(row.play_count) || 0));
      const current = byKey.get(key);
      if (current) {
        current.playCount += playCount;
      } else {
        byKey.set(key, { gameId, provider, playCount });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (b.playCount !== a.playCount) return b.playCount - a.playCount;
    return String(a.gameId).localeCompare(String(b.gameId));
  });
}

async function loadPopularSlotGames(storeCode, limitNum) {
  const replacements = { storeCode };

  const [gspRows, oghRows, scorpioRows] = await Promise.all([
    queryRows(
      `
      SELECT
        CAST(gt.game_id AS TEXT) AS game_id,
        CASE
          WHEN LOWER(COALESCE(gt.provider, '')) = 'bona' THEN 'bona'
          ELSE 'gitslotpark'
        END AS provider,
        COUNT(*)::int AS play_count
      FROM gitslotpark_transactions gt
      INNER JOIN users u ON u.user_id = gt.user_id
      WHERE LOWER(TRIM(COALESCE(u.store_code, ''))) = :storeCode
        AND LOWER(COALESCE(gt.status, '')) = 'completed'
        AND gt.game_id IS NOT NULL
        AND LOWER(COALESCE(gt.provider, '')) NOT IN ('win568', '568win')
        AND (
          LOWER(gt.operation) IN ('withdraw', 'betwin')
          OR (gt.bet_amount IS NOT NULL AND gt.bet_amount > 0)
        )
      GROUP BY 1, 2
      `,
      replacements
    ),
    queryRows(
      `
      SELECT
        CAST(ogh.game_id AS TEXT) AS game_id,
        'onegamehub'::text AS provider,
        COUNT(*)::int AS play_count
      FROM one_game_hub_transactions ogh
      INNER JOIN users u ON u.user_id = ogh.user_id
      WHERE (
          LOWER(TRIM(COALESCE(u.store_code, ''))) = :storeCode
          OR LOWER(TRIM(COALESCE(ogh.store_code, ''))) = :storeCode
        )
        AND LOWER(COALESCE(ogh.status, '')) = 'completed'
        AND LOWER(ogh.operation) = 'bet'
        AND ogh.game_id IS NOT NULL
      GROUP BY 1
      `,
      replacements
    ),
    queryRows(
      `
      SELECT
        CAST(st.game_code AS TEXT) AS game_id,
        'scorpio'::text AS provider,
        COUNT(*)::int AS play_count
      FROM scorpio_transactions st
      INNER JOIN users u ON u.user_id = st.user_id
      WHERE LOWER(TRIM(COALESCE(u.store_code, ''))) = :storeCode
        AND LOWER(COALESCE(st.status, '')) = 'completed'
        AND LOWER(st.command) = 'bet'
        AND st.game_code IS NOT NULL
        AND TRIM(st.game_code) <> ''
      GROUP BY 1
      `,
      replacements
    )
  ]);

  return mergePlayCounts([gspRows, oghRows, scorpioRows]).slice(0, limitNum);
}

/**
 * Most-played casino games for one store, ranked by completed bets from that store's players.
 */
async function getPopularSlotGames({ storeCode, limit = DEFAULT_LIMIT } = {}) {
  const store = normalizeStoreCode(storeCode);
  if (!store) return { storeCode: '', games: [] };

  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const cacheKey = `${store}:${limitNum}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const games = await loadPopularSlotGames(store, limitNum);
  const data = { storeCode: store, games };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

module.exports = {
  getPopularSlotGames,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
