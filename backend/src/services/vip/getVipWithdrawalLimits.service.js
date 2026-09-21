const db = require('../../db/models');
const { getVipLevelsConfig } = require('./getVipLevelsConfig.service');

/** Get VIP-based withdrawal limits for user: per-request max and platform (rolling window) max. Uses store-scoped levels when user has a store. */
async function getVipWithdrawalLimits(userId) {
  const [user, state] = await Promise.all([
    db.User.findByPk(userId, { attributes: ['distributorCode', 'storeCode'], raw: true }),
    db.VipUserState.findOne({ where: { userId }, raw: true })
  ]);
  const scope = user && (user.distributorCode != null || user.storeCode != null)
    ? { distributorCode: user.distributorCode ?? null, storeCode: user.storeCode ?? null }
    : null;
  const levels = await getVipLevelsConfig(scope);
  const levelIndex = state ? Math.max(0, parseInt(state.vip_level_index, 10) || 0) : 0;
  const level = levels[levelIndex];
  if (!level) {
    return { withdrawalLimit: null, platformWithdrawalLimit: null };
  }
  return {
    withdrawalLimit: Number(level.withdrawal_limit) ?? null,
    platformWithdrawalLimit: Number(level.platform_withdrawal_limit) ?? null
  };
}

module.exports = { getVipWithdrawalLimits };
