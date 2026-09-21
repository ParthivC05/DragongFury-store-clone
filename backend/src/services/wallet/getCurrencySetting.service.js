const db = require('../../db/models');

const CURRENCY_KEY = 'currency';
/** Display label / legacy primary wallet code (pre-PSC/BSC). */
const DEFAULT_CURRENCY = 'SC';

/** Purchased SC — credits from deposits / paid packages. */
const PURCHASED_CURRENCY_CODE = 'PSC';

/** Bonus SC — welcome, daily, spin, refer, VIP, admin courtesy, bonus codes. */
const BONUS_CURRENCY_CODE = 'BSC';

/** Redeemable SC — game wins / redemptions; withdrawals use this only. */
const REDEEMABLE_CURRENCY_CODE = 'RSC';

/** DragonFury Gold Coins — entertainment only, optional on packages. */
const { GC_CURRENCY_CODE } = require('../../constants/gcCoins');

/**
 * Get display currency code from settings (e.g. "SC"). Used in affiliate ref bonus,
 * wallet limits messages, and UI labels.
 */
async function getCurrencySetting() {
  try {
    const row = await db.Setting.findOne({ where: { key: CURRENCY_KEY } });
    const code = row && row.value && String(row.value).trim();
    return code || DEFAULT_CURRENCY;
  } catch (err) {
    return DEFAULT_CURRENCY;
  }
}

module.exports = {
  getCurrencySetting,
  CURRENCY_KEY,
  DEFAULT_CURRENCY,
  PURCHASED_CURRENCY_CODE,
  BONUS_CURRENCY_CODE,
  REDEEMABLE_CURRENCY_CODE,
  GC_CURRENCY_CODE
};
