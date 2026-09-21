const db = require('../../db/models');
const {
  getCurrencySetting,
  REDEEMABLE_CURRENCY_CODE,
  PURCHASED_CURRENCY_CODE,
  BONUS_CURRENCY_CODE,
  DEFAULT_CURRENCY
} = require('./getCurrencySetting.service');
const { ensureWallet, usableOf, roundMoney } = require('./walletBuckets.service');
const { getSpinWheelWithdrawalSummary } = require('./validateSpinWheelWithdrawal.service');
const { getCachedBalance, setCachedBalance } = require('./balanceCache');
const { resolveLockedBonusSc } = require('./bonusScLock.service');
const { getGcBalance, isGcCoinsUser } = require('./gcWallet.service');

async function getBalance(userId, { skipCache = false } = {}) {
  if (!skipCache) {
    const cached = getCachedBalance(userId);
    if (cached) return cached;
  }

  const displayCode = await getCurrencySetting();
  const [pscWallet, bscWallet, rscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE),
    ensureWallet(userId, BONUS_CURRENCY_CODE),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE),
    ensureWallet(userId, DEFAULT_CURRENCY)
  ]);

  const pscBal = Number(pscWallet.balance) || 0;
  const pscPlay = Number(pscWallet.playBalance) || 0;
  const pscFrozen = Number(pscWallet.frozenBalance) || 0;
  const usablePsc = usableOf(pscWallet);

  const bscBal = Number(bscWallet.balance) || 0;
  const bscPlay = Number(bscWallet.playBalance) || 0;
  const bscFrozen = Number(bscWallet.frozenBalance) || 0;
  const grossUsableBsc = usableOf(bscWallet);
  const bonusLock = await resolveLockedBonusSc(userId, grossUsableBsc);
  const usableBsc = bonusLock.spendableBsc;
  const lockedBsc = bonusLock.lockedAmount;

  // Leftover legacy SC (should be 0 after migration) counts toward PSC for display/spend.
  const legacyUsable = usableOf(legacyWallet);
  const usablePscTotal = roundMoney(usablePsc + legacyUsable);
  const pscBalTotal = roundMoney(pscBal + (Number(legacyWallet.balance) || 0));
  const pscPlayTotal = roundMoney(pscPlay + (Number(legacyWallet.playBalance) || 0));
  const pscFrozenTotal = roundMoney(pscFrozen + (Number(legacyWallet.frozenBalance) || 0));

  const rscBal = Number(rscWallet.balance) || 0;
  const rscPlay = Number(rscWallet.playBalance) || 0;
  const rscFrozen = Number(rscWallet.frozenBalance) || 0;
  const usableRsc = usableOf(rscWallet);
  const availableToWithdrawRsc = usableRsc;
  const spinWheelWithdrawal = await getSpinWheelWithdrawalSummary(userId, availableToWithdrawRsc);
  const showGc = await isGcCoinsUser(userId);
  const balanceGc = showGc ? await getGcBalance(userId) : 0;

  // Compatibility: balance_sc / usable_balance_sc = PSC + BSC (non-redeemable playable).
  const balanceSc = roundMoney(pscBalTotal + bscBal);
  const usableSc = roundMoney(usablePscTotal + usableBsc);
  const playBalanceSc = roundMoney(pscPlayTotal + bscPlay);
  const frozenSc = roundMoney(pscFrozenTotal + bscFrozen);

  const payload = {
    currency_code: displayCode,
    purchased_currency_code: PURCHASED_CURRENCY_CODE,
    bonus_currency_code: BONUS_CURRENCY_CODE,
    redeemable_currency_code: REDEEMABLE_CURRENCY_CODE,

    balance_psc: pscBalTotal,
    usable_balance_psc: usablePscTotal,
    play_balance_psc: pscPlayTotal,
    frozen_balance_psc: pscFrozenTotal,

    balance_bsc: bscBal,
    usable_balance_bsc: usableBsc,
    play_balance_bsc: bscPlay,
    frozen_balance_bsc: bscFrozen,
    /** Bonus SC held until phone verification when the store requires OTP. */
    locked_balance_bsc: lockedBsc,
    locked_balance_sc: lockedBsc,
    bonus_sc_locked: bonusLock.locked === true,
    unlock_bonus_sc_via: bonusLock.locked ? 'phone_verification' : null,

    /** Combined non-redeemable (PSC+BSC) — keeps older clients working. */
    balance_sc: balanceSc,
    usable_balance_sc: usableSc,
    play_balance_sc: playBalanceSc,
    frozen_balance_sc: frozenSc,

    balance_rsc: rscBal,
    usable_balance_rsc: usableRsc,
    play_balance_rsc: rscPlay,
    frozen_balance_rsc: rscFrozen,
    /** Withdrawals use RSC only */
    available_to_withdraw_sc: availableToWithdrawRsc,
    balance_gc: balanceGc,
    usable_balance_gc: balanceGc,
    ...spinWheelWithdrawal
  };

  setCachedBalance(userId, payload);
  return payload;
}

module.exports = { getBalance };
