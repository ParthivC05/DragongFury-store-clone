const db = require('../../db/models');

const VIP_SETTINGS_KEY = 'vip_settings';

/** Default levels when no vip_settings row exists (e.g. before global default is set). Includes color (hex #rrggbb) for each tier. */
const DEFAULT_LEVELS = [
  { level_index: 0, name: 'Iron', color: '#64748b', xp_to_next_level: 500, level_up_reward_sc: 2, withdrawal_limit: 500, platform_withdrawal_limit: 400 },
  { level_index: 1, name: 'Bronze', color: '#b45309', xp_to_next_level: 1000, level_up_reward_sc: 5, withdrawal_limit: 1000, platform_withdrawal_limit: 800 },
  { level_index: 2, name: 'Silver', color: '#94a3b8', xp_to_next_level: 2500, level_up_reward_sc: 10, withdrawal_limit: 2500, platform_withdrawal_limit: 2000 },
  { level_index: 3, name: 'Gold', color: '#eab308', xp_to_next_level: 5000, level_up_reward_sc: 25, withdrawal_limit: 5000, platform_withdrawal_limit: 4000 },
  { level_index: 4, name: 'Platinum', color: '#a8b2c1', xp_to_next_level: 10000, level_up_reward_sc: 50, withdrawal_limit: 10000, platform_withdrawal_limit: 8000 },
  { level_index: 5, name: 'Diamond', color: '#06b6d4', xp_to_next_level: 25000, level_up_reward_sc: 100, withdrawal_limit: 25000, platform_withdrawal_limit: 20000 }
];

/** Read value from row (Sequelize raw can return camelCase or snake_case). */
function num(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) return Number(v);
  }
  return 0;
}
function val(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function normalizeColor(hex) {
  if (!hex || typeof hex !== 'string') return '#6c757d';
  const t = String(hex).trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return '#' + t.toLowerCase();
  if (/^[0-9A-Fa-f]{3}$/.test(t)) return '#' + t[0] + t[0] + t[1] + t[1] + t[2] + t[2];
  return '#6c757d';
}

function mapLevelRow(row) {
  return {
    level_index: num(row, 'level_index', 'levelIndex'),
    name: val(row, 'name') || '',
    color: normalizeColor(val(row, 'color')),
    xp_to_next_level: num(row, 'xp_to_next_level', 'xpToNextLevel'),
    level_up_reward_sc: num(row, 'level_up_reward_sc', 'levelUpRewardSc'),
    withdrawal_limit: num(row, 'withdrawal_limit', 'withdrawalLimit'),
    platform_withdrawal_limit: num(row, 'platform_withdrawal_limit', 'platformWithdrawalLimit')
  };
}

async function getVipLevelsConfig(scope = null) {
  const readFromSetting = async (distributorCode, storeCode) => {
    const row = await db.Setting.findOne({
      where: { key: VIP_SETTINGS_KEY, distributorCode: distributorCode ?? null, storeCode: storeCode ?? null }
    });
    if (!row?.value) return null;
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed.levels) && parsed.levels.length > 0) {
        return parsed.levels.map((r, i) => mapLevelRow({ ...r, level_index: r.level_index ?? i }));
      }
    } catch (_) {}
    return null;
  };

  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeLevels = await readFromSetting(scope.distributorCode, scope.storeCode);
    if (storeLevels) return storeLevels;
  }

  const globalLevels = await readFromSetting(null, null);
  if (globalLevels) return globalLevels;

  return DEFAULT_LEVELS.map((r, i) => mapLevelRow({ ...r, level_index: i }));
}

module.exports = { getVipLevelsConfig, DEFAULT_LEVELS };
