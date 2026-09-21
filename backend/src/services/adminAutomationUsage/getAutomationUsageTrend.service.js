'use strict';

const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { appendExcludedOperationsSql } = require('./automationUsageFilters');

/**
 * Daily trend of third-party bot API calls and errors.
 */
async function getAutomationUsageTrend({
  startDate = null,
  endDate = null,
  gameId = null,
  gameName = null,
  storeCode = null
} = {}) {
  if (!db.GameAutomationApiLog) return [];

  const dialect = db.sequelize.getDialect();
  if (dialect !== 'postgres') return [];

  const replacements = {};
  const conditions = ['1=1'];
  Object.assign(replacements, appendExcludedOperationsSql(conditions));

  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from) {
    conditions.push('l.created_at >= :startDate');
    replacements.startDate = from;
  }
  if (to) {
    conditions.push('l.created_at <= :endDate');
    replacements.endDate = to;
  }
  if (gameName != null && String(gameName).trim() !== '' && String(gameName).trim() !== 'all') {
    conditions.push('LOWER(TRIM(l.game_name)) = LOWER(TRIM(:gameName))');
    replacements.gameName = String(gameName).trim();
  } else if (gameId != null && String(gameId).trim() !== '' && String(gameId).trim() !== 'all') {
    const gid = parseInt(gameId, 10);
    if (!Number.isNaN(gid)) {
      conditions.push('l.game_id = :gameId');
      replacements.gameId = gid;
    }
  }
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    conditions.push('l.store_code = :storeCode');
    replacements.storeCode = String(storeCode).trim();
  }

  const sql = `
    SELECT date_trunc('day', l.created_at)::date AS date,
      COUNT(*)::int AS total_calls,
      SUM(CASE WHEN l.success = false THEN 1 ELSE 0 END)::int AS error_calls,
      SUM(CASE WHEN l.success = true THEN 1 ELSE 0 END)::int AS success_calls
    FROM game_automation_api_logs l
    WHERE ${conditions.join(' AND ')}
    GROUP BY date_trunc('day', l.created_at)
    ORDER BY 1
  `;

  const rows = await db.sequelize.query(sql.trim(), {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT
  });

  const formatDay = (d) => (d && d.toISOString ? d.toISOString().slice(0, 10) : d);
  return (rows || []).map((r) => ({
    date: formatDay(r.date),
    totalCalls: Number(r.total_calls) || 0,
    errorCalls: Number(r.error_calls) || 0,
    successCalls: Number(r.success_calls) || 0
  }));
}

module.exports = { getAutomationUsageTrend };
