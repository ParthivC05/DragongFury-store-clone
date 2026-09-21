'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { storeCodeToDisplayName } = require('../games/recordGameManualModeLog.service');
const { excludeOperationsFromSequelizeWhere } = require('./automationUsageFilters');
const {
  getAutomationUsageDisplayName,
  getAutomationUsageGroupKey,
  resolveAutomationUsageSplitKey,
  splitKeyToDisplayName
} = require('./automationUsageGameSplit');
const {
  isOrionStarsGame,
  isFirekirinGame,
  isMilkywayGame
} = require('../../utils/gameIntegration.helpers');

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function emptyStats() {
  return { totalCalls: 0, errorCalls: 0, successCalls: 0 };
}

function addStats(target, success) {
  target.totalCalls += 1;
  if (success) target.successCalls += 1;
  else target.errorCalls += 1;
}

/**
 * List automation-capable games grouped by game name with aggregated API usage stats.
 * OrionStars / Firekirin / Milkyway success & failure rates are split by Agent vs Bot API endpoint.
 */
async function getAutomationUsageGames({ startDate = null, endDate = null, storeCode = null } = {}) {
  const gameWhere = {
    botApiUrl: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
  };
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    gameWhere.addedByStoreCode = String(storeCode).trim();
  }

  const games = await db.Game.findAll({
    where: gameWhere,
    attributes: [
      'id', 'name', 'gameKey', 'addedByStoreCode', 'botOffline', 'botApiUrl',
      'botApiKey', 'streamlitToken', 'agentId', 'isActive'
    ],
    order: [['name', 'ASC'], ['addedByStoreCode', 'ASC']]
  });

  const logWhere = {};
  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from || to) {
    logWhere.createdAt = {};
    if (from) logWhere.createdAt[Op.gte] = from;
    if (to) logWhere.createdAt[Op.lte] = to;
  }
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    logWhere.storeCode = String(storeCode).trim();
  }

  const gamesById = new Map();
  for (const game of games) {
    const json = game.toJSON ? game.toJSON() : game;
    gamesById.set(Number(json.id), json);
  }

  // Per gameId + splitKey (agent/bot) stats for Orion/Firekirin/Milkyway; plain per gameId for others.
  const statsByGameSplit = new Map();
  const gameIds = [...gamesById.keys()];

  if (gameIds.length > 0 && db.GameAutomationApiLog) {
    const logRows = await db.GameAutomationApiLog.findAll({
      where: excludeOperationsFromSequelizeWhere({ ...logWhere, gameId: { [Op.in]: gameIds } }),
      attributes: ['gameId', 'apiEndpoint', 'success'],
      raw: true
    });

    for (const row of logRows) {
      const gid = Number(row.gameId ?? row.game_id);
      const game = gamesById.get(gid);
      if (!game) continue;
      const splitKey = resolveAutomationUsageSplitKey(game, row.apiEndpoint);
      const mapKey = `${gid}::${splitKey}`;
      if (!statsByGameSplit.has(mapKey)) {
        statsByGameSplit.set(mapKey, { gameId: gid, splitKey, ...emptyStats() });
      }
      addStats(statsByGameSplit.get(mapKey), row.success === true);
    }
  }

  const groupMap = new Map();

  function ensureGroup(splitKey, displayName) {
    if (!groupMap.has(splitKey)) {
      groupMap.set(splitKey, {
        gameKey: splitKey,
        gameName: displayName,
        instanceCount: 0,
        storeCount: 0,
        automationOnCount: 0,
        automationOffCount: 0,
        inactiveCount: 0,
        totalCalls: 0,
        errorCalls: 0,
        successCalls: 0,
        instances: [],
        _seenGameIds: new Set(),
        _storeCodes: new Set(),
        _hasPlatform: false
      });
    }
    return groupMap.get(splitKey);
  }

  // Build instance rows from games; attach split-aware stats.
  for (const game of gamesById.values()) {
    const code = game.addedByStoreCode || null;
    const defaultKey = getAutomationUsageGroupKey(game);
    const isSplitFamily = isOrionStarsGame(game) || isFirekirinGame(game) || isMilkywayGame(game);

    const relevantStats = [];
    for (const entry of statsByGameSplit.values()) {
      if (entry.gameId !== game.id) continue;
      relevantStats.push(entry);
    }

    if (!relevantStats.length) {
      // No logs — still show under default classification.
      relevantStats.push({ gameId: game.id, splitKey: defaultKey, ...emptyStats() });
    }

    for (const entry of relevantStats) {
      // For non-split families keep a single instance under default key.
      const splitKey = isSplitFamily ? entry.splitKey : defaultKey;
      const displayName = splitKeyToDisplayName(splitKey) || getAutomationUsageDisplayName(game);
      const group = ensureGroup(splitKey, displayName);

      if (!group._seenGameIds.has(game.id)) {
        group._seenGameIds.add(game.id);
        group.instanceCount += 1;
        if (code) group._storeCodes.add(code);
        else group._hasPlatform = true;
        if (!game.botOffline && game.isActive) group.automationOnCount += 1;
        else if (game.isActive) group.automationOffCount += 1;
        else group.inactiveCount += 1;
      }

      group.totalCalls += entry.totalCalls;
      group.errorCalls += entry.errorCalls;
      group.successCalls += entry.successCalls;

      group.instances.push({
        id: game.id,
        name: displayName,
        gameKey: splitKey,
        rawGameName: game.name,
        storeCode: code,
        storeName: code ? storeCodeToDisplayName(code) : 'Unassigned',
        botOffline: !!game.botOffline,
        automationEnabled: !game.botOffline,
        isActive: !!game.isActive,
        totalCalls: entry.totalCalls,
        errorCalls: entry.errorCalls,
        successCalls: entry.successCalls,
        errorRate: pct(entry.errorCalls, entry.totalCalls),
        successRate: pct(entry.successCalls, entry.totalCalls)
      });
    }
  }

  const groupedGames = Array.from(groupMap.values()).map((group) => {
    const storeCount = group._storeCodes.size + (group._hasPlatform ? 1 : 0);
    const { _seenGameIds, _storeCodes, _hasPlatform, ...rest } = group;
    return {
      ...rest,
      storeCount,
      errorRate: pct(group.errorCalls, group.totalCalls),
      successRate: pct(group.successCalls, group.totalCalls),
      instances: group.instances.sort((a, b) => {
        const sa = a.storeName || '';
        const sb = b.storeName || '';
        return sa.localeCompare(sb);
      })
    };
  });

  groupedGames.sort((a, b) => {
    if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
    if (b.errorCalls !== a.errorCalls) return b.errorCalls - a.errorCalls;
    if (b.totalCalls !== a.totalCalls) return b.totalCalls - a.totalCalls;
    return a.gameName.localeCompare(b.gameName);
  });

  const instances = groupedGames.flatMap((g) => g.instances);

  const summary = groupedGames.reduce(
    (acc, g) => ({
      gameCount: acc.gameCount + 1,
      instanceCount: acc.instanceCount + g.instanceCount,
      totalCalls: acc.totalCalls + g.totalCalls,
      errorCalls: acc.errorCalls + g.errorCalls,
      successCalls: acc.successCalls + g.successCalls
    }),
    { gameCount: 0, instanceCount: 0, totalCalls: 0, errorCalls: 0, successCalls: 0 }
  );
  summary.errorRate = pct(summary.errorCalls, summary.totalCalls);
  summary.successRate = pct(summary.successCalls, summary.totalCalls);

  return {
    summary,
    games: groupedGames,
    instances
  };
}

module.exports = { getAutomationUsageGames, normalizeGameKey: (n) => String(n || '').trim().toLowerCase() };
