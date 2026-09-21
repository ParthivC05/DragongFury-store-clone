'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { storeCodeToDisplayName } = require('./recordGameManualModeLog.service');
const { FIELD_LABELS, ACTION_LABELS } = require('./recordGameHistory.service');

const LEGACY_PASSWORD_MASK = '••••••••';
const LEGACY_PASSWORD_CHANGED = '[changed]';

function isLegacyPasswordPlaceholder(value) {
  if (value == null || value === '') return false;
  const v = String(value).trim();
  return v === LEGACY_PASSWORD_MASK || v === LEGACY_PASSWORD_CHANGED;
}

function isStoredPasswordValue(value) {
  if (value == null || value === '') return false;
  const v = String(value).trim();
  return v !== '' && v !== '—' && !isLegacyPasswordPlaceholder(v);
}

/**
 * Backfill legacy password_changed rows that stored •••••••• / [changed].
 * Uses current game password for the latest change per game and chains earlier rows when possible.
 */
async function enrichLegacyPasswordHistoryRows(list) {
  const gameIds = [
    ...new Set(
      list
        .filter((row) => row.action === 'password_changed' && row.gameId)
        .map((row) => row.gameId)
    )
  ];
  if (gameIds.length === 0) return list;

  const games = await db.Game.findAll({
    where: { id: { [Op.in]: gameIds } },
    attributes: ['id', 'botPassword']
  });
  const currentPasswordByGameId = new Map(
    games.map((g) => {
      const json = g.toJSON ? g.toJSON() : g;
      const password = json.botPassword != null ? String(json.botPassword).trim() : '';
      return [json.id, password || null];
    })
  );

  const historyRows = await db.GameHistory.findAll({
    where: { gameId: { [Op.in]: gameIds }, action: 'password_changed' },
    order: [['createdAt', 'ASC']],
    attributes: ['id', 'gameId', 'oldValue', 'newValue', 'createdAt']
  });

  const chainByGameId = new Map();
  for (const row of historyRows) {
    const json = row.toJSON ? row.toJSON() : row;
    if (!chainByGameId.has(json.gameId)) chainByGameId.set(json.gameId, []);
    chainByGameId.get(json.gameId).push({
      id: json.id,
      oldValue: json.oldValue,
      newValue: json.newValue
    });
  }

  const enrichedByRowId = new Map();

  for (const [gameId, chain] of chainByGameId) {
    const enriched = chain.map((entry) => ({
      id: entry.id,
      oldValue: entry.oldValue,
      newValue: entry.newValue
    }));

    const currentPassword = currentPasswordByGameId.get(gameId);
    const last = enriched[enriched.length - 1];
    if (last && isLegacyPasswordPlaceholder(last.newValue) && currentPassword) {
      last.newValue = currentPassword;
    }

    for (let i = 1; i < enriched.length; i++) {
      if (isLegacyPasswordPlaceholder(enriched[i].oldValue) && isStoredPasswordValue(enriched[i - 1].newValue)) {
        enriched[i].oldValue = enriched[i - 1].newValue;
      }
    }

    for (let i = enriched.length - 2; i >= 0; i--) {
      if (isLegacyPasswordPlaceholder(enriched[i].newValue) && isStoredPasswordValue(enriched[i + 1].oldValue)) {
        enriched[i].newValue = enriched[i + 1].oldValue;
      }
    }

    for (let i = 1; i < enriched.length; i++) {
      if (isLegacyPasswordPlaceholder(enriched[i].oldValue) && isStoredPasswordValue(enriched[i - 1].newValue)) {
        enriched[i].oldValue = enriched[i - 1].newValue;
      }
    }

    for (const entry of enriched) {
      enrichedByRowId.set(entry.id, { oldValue: entry.oldValue, newValue: entry.newValue });
    }
  }

  return list.map((row) => {
    const enriched = enrichedByRowId.get(row.id);
    if (!enriched) return row;
    return { ...row, oldValue: enriched.oldValue, newValue: enriched.newValue };
  });
}

/**
 * Paginated game configuration history for technical staff.
 */
async function getGameHistory({
  page = 1,
  limit = 25,
  storeCode = null,
  gameId = null,
  gameName = null,
  action = null,
  startDate = null,
  endDate = null,
  timezoneOffset = null
} = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (safePage - 1) * safeLimit;

  const where = {};
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    where.storeCode = String(storeCode).trim();
  }
  const nameFilter = gameName != null ? String(gameName).trim() : '';
  if (nameFilter && nameFilter !== 'all') {
    where.gameName = { [Op.iLike]: nameFilter };
  } else if (gameId != null && String(gameId).trim() !== '' && String(gameId).trim() !== 'all') {
    const gid = parseInt(gameId, 10);
    if (!Number.isNaN(gid)) where.gameId = gid;
  }
  if (action != null && String(action).trim() !== '' && String(action).trim() !== 'all') {
    where.action = String(action).trim();
  }
  const from = toDateRangeStart(startDate, timezoneOffset);
  const to = toDateRangeEnd(endDate, timezoneOffset);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

  const { count, rows } = await db.GameHistory.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  const list = rows.map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    const code = json.storeCode || null;
    const fieldName = json.fieldName || null;
    return {
      id: json.id,
      gameId: json.gameId,
      gameName: json.gameName,
      storeCode: code,
      storeName: code ? storeCodeToDisplayName(code) : null,
      action: json.action,
      actionLabel: ACTION_LABELS[json.action] || json.action,
      fieldName,
      fieldLabel: fieldName ? FIELD_LABELS[fieldName] || fieldName : null,
      oldValue: json.oldValue,
      newValue: json.newValue,
      changedByName: json.changedByName,
      changedByRole: json.changedByRole,
      triggerSource: json.triggerSource,
      details: json.details,
      createdAt: json.createdAt
    };
  });

  const enrichedList = await enrichLegacyPasswordHistoryRows(list);

  const totalPages = Math.ceil(count / safeLimit) || 0;

  return {
    rows: enrichedList,
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages
  };
}

module.exports = { getGameHistory };
