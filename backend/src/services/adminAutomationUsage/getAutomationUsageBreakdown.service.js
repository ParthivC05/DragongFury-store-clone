'use strict';

const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { appendExcludedOperationsSql } = require('./automationUsageFilters');

/**
 * Per-game API call breakdown (aggregated by game_name in logs).
 */
async function getAutomationUsageBreakdown({
  startDate = null,
  endDate = null,
  gameName = null,
  storeCode = null
} = {}) {
  if (!db.GameAutomationApiLog) return [];

  const dialect = db.sequelize.getDialect();
  if (dialect !== 'postgres') return [];

  const replacements = {};
  const conditions = ['l.game_name IS NOT NULL', "TRIM(l.game_name) <> ''"];
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
  }
  if (storeCode != null && String(storeCode).trim() !== '' && String(storeCode).trim() !== 'all') {
    conditions.push('l.store_code = :storeCode');
    replacements.storeCode = String(storeCode).trim();
  }

  const sql = `
    SELECT TRIM(l.game_name) AS game_name,
      COUNT(*)::int AS total_calls,
      SUM(CASE WHEN l.success = false THEN 1 ELSE 0 END)::int AS error_calls,
      SUM(CASE WHEN l.success = true THEN 1 ELSE 0 END)::int AS success_calls
    FROM game_automation_api_logs l
    WHERE ${conditions.join(' AND ')}
    GROUP BY LOWER(TRIM(l.game_name)), TRIM(l.game_name)
    ORDER BY error_calls DESC, total_calls DESC, game_name ASC
  `;

  const rows = await db.sequelize.query(sql.trim(), {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT
  });

  return (rows || []).map((r) => {
    const total = Number(r.total_calls) || 0;
    const errors = Number(r.error_calls) || 0;
    return {
      gameName: r.game_name,
      totalCalls: total,
      errorCalls: errors,
      successCalls: Number(r.success_calls) || 0,
      errorRate: total ? Math.round((errors / total) * 1000) / 10 : 0
    };
  });
}

module.exports = { getAutomationUsageBreakdown };
