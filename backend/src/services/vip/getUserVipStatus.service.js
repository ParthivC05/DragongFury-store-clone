const db = require('../../db/models');
const { getVipLevelsConfig } = require('./getVipLevelsConfig.service');

/** Get current user VIP status and all levels for UI. scope = null for global; scope = { distributorCode, storeCode } for store-specific levels. */
async function getUserVipStatus(userId, scope = null) {
  const [levels, state] = await Promise.all([
    getVipLevelsConfig(scope),
    db.VipUserState.findOne({ where: { userId } })
  ]);
  const maxLevelIndex = levels.length > 0 ? levels.length - 1 : 0;
  let levelIndex = state ? Math.max(0, parseInt(state.vipLevelIndex, 10) || 0) : 0;
  const currentXp = state ? Math.max(0, parseFloat(state.vipXp) || 0) : 0;

  // Clamp invalid level_index (e.g. 6 when only 0-5 exist) and correct DB
  if (levelIndex > maxLevelIndex) {
    levelIndex = 0;
    if (state) {
      await state.update({ vipLevelIndex: 0 }).catch(() => {});
    }
  }

  const currentLevel = levels[levelIndex] || levels[0];
  const nextLevelXp = currentLevel ? (currentLevel.xp_to_next_level ?? 500) : 500;
  const isMaxLevel = levels.length > 0 && levelIndex >= levels.length - 1;

  const levelsWithProgress = levels.map((l, i) => {
    const xpToNext = l.xp_to_next_level ?? l.next_level_xp ?? 0;
    const completedTierXp = Number(xpToNext) || 0;
    // Past tiers: show full. Current tier: show real vip_xp. For last tier only show "max" / full when vip_xp >= tier requirement (25000).
    let displayXp = i < levelIndex ? completedTierXp : (i === levelIndex ? currentXp : 0);
    if (i === levelIndex && i === maxLevelIndex && currentXp >= completedTierXp) {
      displayXp = completedTierXp; // user has filled this tier → show as complete (25000 XP max)
    }
    return {
      ...l,
      current_xp: displayXp,
      next_level_xp: xpToNext,
      is_current: i === levelIndex,
      is_unlocked: i <= levelIndex,
      is_max_level: i === levels.length - 1
    };
  });

  // At max level still expose tier requirement as next_level_xp so UI can show progress (e.g. 530 / 25000). Bar fills only when current_xp >= 25000.
  const nextLevelXpForResponse = isMaxLevel
    ? (currentLevel ? (currentLevel.xp_to_next_level ?? currentLevel.next_level_xp) : null)
    : nextLevelXp;

  return {
    level_index: levelIndex,
    level_name: currentLevel?.name || 'Iron',
    current_xp: currentXp,
    next_level_xp: nextLevelXpForResponse ?? nextLevelXp,
    is_max_level: isMaxLevel,
    levels: levelsWithProgress
  };
}

module.exports = { getUserVipStatus };
