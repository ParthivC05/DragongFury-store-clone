const db = require('../../db/models');
const { getVipSettings, KEY } = require('./getVipSettings.service');
const { updateVipSettings } = require('./updateVipSettings.service');

async function resetVipSettingsToDefault(scope, section = null) {
  if (!scope || (scope.distributorCode == null && scope.storeCode == null)) return;

  if (section === 'levels' || section === 'faq') {
    const defaultSettings = await getVipSettings(null);
    const currentSettings = await getVipSettings(scope);
    const payload = section === 'levels'
      ? { levels: defaultSettings.levels, faq: currentSettings.faq }
      : { levels: currentSettings.levels, faq: defaultSettings.faq };
    await updateVipSettings(payload, scope);
    return;
  }

  await db.Setting.destroy({
    where: { key: KEY, distributorCode: scope.distributorCode ?? null, storeCode: scope.storeCode ?? null }
  });
}

module.exports = { resetVipSettingsToDefault };
