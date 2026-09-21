const db = require('../../db/models');
const { getVipSettings, KEY } = require('./getVipSettings.service');
// KEY is 'vip_settings' for Setting model

const MIN_LEVELS = 1;
const MAX_LEVELS = 20;

function num(v) {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v, maxLen = 4096) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeColor(hex) {
  if (!hex || typeof hex !== 'string') return '#6c757d';
  const t = String(hex).trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return '#' + t.toLowerCase();
  if (/^[0-9A-Fa-f]{3}$/.test(t)) return '#' + t[0] + t[0] + t[1] + t[1] + t[2] + t[2];
  return '#6c757d';
}

function normalizeLevel(row, index) {
  return {
    level_index: index,
    name: str(row?.name, 32) || `Level ${index}`,
    color: normalizeColor(row?.color),
    xp_to_next_level: Math.max(0, num(row?.xp_to_next_level) || 500),
    level_up_reward_sc: Math.max(0, num(row?.level_up_reward_sc)),
    withdrawal_limit: Math.max(0, num(row?.withdrawal_limit)),
    platform_withdrawal_limit: Math.max(0, num(row?.platform_withdrawal_limit))
  };
}

function normalizeFaqItem(row, index) {
  return {
    id: row?.id ?? index,
    question: str(row?.question, 512),
    answer: str(row?.answer, 4096),
    sort_order: Math.max(0, num(row?.sort_order) ?? index)
  };
}

/**
 * Update VIP settings for a scope. scope = null for global; scope = { distributorCode, storeCode } for store.
 */
async function updateVipSettings(payload, scope = null) {
  const existing = await getVipSettings(scope);
  let levels = Array.isArray(payload.levels) ? payload.levels : existing.levels;
  let faq = Array.isArray(payload.faq) ? payload.faq : existing.faq;

  levels = levels.map((row, i) => normalizeLevel(row, i));
  if (levels.length < MIN_LEVELS || levels.length > MAX_LEVELS) {
    const err = new Error(`Levels count must be between ${MIN_LEVELS} and ${MAX_LEVELS}.`);
    err.statusCode = 400;
    throw err;
  }

  faq = faq.map((row, i) => normalizeFaqItem(row, i));

  const value = JSON.stringify({ levels, faq });
  const distributorCode = scope && scope.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope && scope.storeCode != null ? scope.storeCode : null;

  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value }
  });
  await row.update({ value });

  return { levels, faq };
}

module.exports = { updateVipSettings, normalizeLevel, normalizeFaqItem };
