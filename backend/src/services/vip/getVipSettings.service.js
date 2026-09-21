const { getVipLevelsConfig } = require('./getVipLevelsConfig.service');
const { getVipFaq } = require('./getVipFaq.service');

const KEY = 'vip_settings';

/**
 * Get VIP settings (levels + faq) for admin for a scope.
 * scope = null → global (from tables or Setting null,null).
 * scope = { distributorCode, storeCode } → store override or fallback to global.
 */
async function getVipSettings(scope = null) {
  const levels = await getVipLevelsConfig(scope);
  const faq = await getVipFaq(scope);
  return { levels, faq };
}

module.exports = { getVipSettings, KEY };
