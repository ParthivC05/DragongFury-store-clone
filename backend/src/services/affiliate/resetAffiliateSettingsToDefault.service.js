const db = require('../../db/models');
const { KEY } = require('./getAffiliateSettings.service');

/**
 * Reset affiliate settings for store scope: remove store override so store falls back to global default.
 * Only for store scope (distributorCode/storeCode set). Master admin uses global; store admin resets their store.
 */
async function resetAffiliateSettingsToDefault(scope) {
  if (!scope || (scope.distributorCode == null && scope.storeCode == null)) return;
  await db.Setting.destroy({
    where: { key: KEY, distributorCode: scope.distributorCode ?? null, storeCode: scope.storeCode ?? null }
  });
}

module.exports = { resetAffiliateSettingsToDefault };
