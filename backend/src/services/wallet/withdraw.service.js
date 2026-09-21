const db = require('../../db/models');
const { Op } = require('sequelize');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { getBalance } = require('./getBalance.service');
const { applyWithdrawalBonuses } = require('../promotions/applyWithdrawalBonuses.service');
const { getVipWithdrawalLimits } = require('../vip/getVipWithdrawalLimits.service');
const { assertSpinWheelWithdrawalAllowed } = require('./validateSpinWheelWithdrawal.service');
const { assertDailyWithdrawalLimit } = require('./assertDailyWithdrawalLimit.service');
const { zeroRemainingWalletsAfterNeverDepositedWithdraw } = require('./neverDepositedWithdraw.service');
const { rscAvailableToWithdraw } = require('./walletBuckets.service');

async function withdraw(userId, body) {
  const [limits, displayCurrencyCode, vipLimits] = await Promise.all([
    getWalletLimitsForUser(userId),
    getCurrencySetting(),
    getVipWithdrawalLimits(userId).catch(() => ({ withdrawalLimit: null, platformWithdrawalLimit: null }))
  ]);
  const redeemableCode = REDEEMABLE_CURRENCY_CODE;
  const { withdrawMin, withdrawMax, withdrawLimitHours } = limits;
  const effectiveWindowMax = (vipLimits.platformWithdrawalLimit != null && vipLimits.platformWithdrawalLimit > 0)
    ? Math.min(withdrawMax, vipLimits.platformWithdrawalLimit)
    : withdrawMax;
  const effectivePerRequestMax = (vipLimits.withdrawalLimit != null && vipLimits.withdrawalLimit > 0)
    ? Math.min(effectiveWindowMax, vipLimits.withdrawalLimit)
    : effectiveWindowMax;

  const amount = body?.amount != null ? Number(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < withdrawMin) {
    const err = new Error(`Minimum withdrawal is ${displayCurrencyCode} ${withdrawMin}.00`);
    err.statusCode = 400;
    throw err;
  }
  if (amount > effectivePerRequestMax) {
    if (limits.neverDeposited) {
      const { neverDepositedWithdrawMaxError } = require('./neverDepositedWithdraw.service');
      throw neverDepositedWithdrawMaxError();
    }
    const err = new Error(
      vipLimits.withdrawalLimit != null
        ? `Your VIP withdrawal limit is ${displayCurrencyCode} ${effectivePerRequestMax}.00 per request (platform limit ${vipLimits.platformWithdrawalLimit} in ${withdrawLimitHours}h). This request exceeds the limit.`
        : `Maximum withdrawal is ${displayCurrencyCode} ${effectiveWindowMax}.00 within ${withdrawLimitHours} hours. This request exceeds the limit.`
    );
    err.statusCode = 400;
    throw err;
  }

  const method = (body?.method && typeof body.method === 'string') ? body.method.trim().slice(0, 64) : null;
  const linkedAccountId = (body?.linkedAccountId ?? body?.linked_account_id ?? '').toString().trim().slice(0, 255) || null;
  const currency = (body?.currency ?? '').toString().trim().slice(0, 8) || null;
  const reason = (body?.reason ?? '').toString().trim().slice(0, 2000) || null;
  const routingType = (body?.routingType ?? body?.routing_type ?? '').toString().trim().slice(0, 64) || null;
  const gameName = (body?.gameName ?? body?.game_name ?? '').toString().trim().slice(0, 255) || null;
  const gameUsername = (body?.gameUsername ?? body?.game_username ?? '').toString().trim().slice(0, 255) || null;

  let wallet = await db.Wallet.findOne({
    where: { userId, currencyCode: redeemableCode }
  });
  if (!wallet) {
    wallet = await db.Wallet.create({
      userId,
      currencyCode: redeemableCode,
      balance: 0,
      playBalance: 0,
      frozenBalance: 0
    });
  }

  const availableToWithdraw = rscAvailableToWithdraw(wallet);

  if (amount > availableToWithdraw) {
    const err = new Error(
      'Insufficient redeemable balance (RSC). Withdrawals use funds from game wins and redemptions only.'
    );
    err.statusCode = 400;
    throw err;
  }

  await assertSpinWheelWithdrawalAllowed(userId, amount, availableToWithdraw);

  // Rolling window: only count approved/completed withdrawals in the last WITHDRAW_WINDOW_HOURS
  const windowStart = new Date(Date.now() - withdrawLimitHours * 60 * 60 * 1000);
  const recent = await db.WithdrawalRequest.findAll({
    where: {
      userId,
      status: 'completed',
      created_at: { [Op.gte]: windowStart }
    },
    attributes: ['amount']
  });
  const withdrawnInWindow = recent.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const remainingInWindow = Math.max(0, effectiveWindowMax - withdrawnInWindow);

  if (amount > remainingInWindow) {
    const err = new Error(
      remainingInWindow === 0
        ? `You have reached your VIP withdrawal limit (${displayCurrencyCode} ${effectiveWindowMax}.00 in ${withdrawLimitHours} hours). You cannot withdraw until some of your previous withdrawals fall outside the ${withdrawLimitHours}-hour window.`
        : `You can only withdraw ${displayCurrencyCode} ${remainingInWindow.toFixed(2)} more in the next ${withdrawLimitHours} hours. You have already withdrawn ${displayCurrencyCode} ${withdrawnInWindow.toFixed(2)} in the last ${withdrawLimitHours} hours.`
    );
    err.statusCode = 400;
    throw err;
  }

  let promotionBonusesApplied = [];
  try {
    promotionBonusesApplied = await db.sequelize.transaction(async (t) => {
      const lockedWallet = await db.Wallet.findOne({
        where: { id: wallet.id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const lockedBalance = Number(lockedWallet.balance) || 0;
      const lockedAvailable = rscAvailableToWithdraw(lockedWallet);
      if (amount > lockedAvailable) {
        const err = new Error(
          'Insufficient redeemable balance (RSC). Withdrawals use funds from game wins and redemptions only.'
        );
        err.statusCode = 400;
        throw err;
      }

      await assertDailyWithdrawalLimit(userId, amount, {
        displayCurrency: displayCurrencyCode,
        transaction: t
      });

      const newBalance = Math.round((lockedBalance - amount) * 100) / 100;
      await lockedWallet.update({ balance: Number(newBalance) }, { transaction: t });
      const withdrawalReq = await db.WithdrawalRequest.create(
        {
          userId,
          amount: Number(amount),
          method: method || 'test',
          status: 'completed',
          linkedAccountId,
          currency,
          reason,
          routingType,
          gameName,
          gameUsername
        },
        { transaction: t }
      );
      if (db.UserTransaction) {
        await db.UserTransaction.create(
          {
            userId,
            type: 'withdraw',
            amount: Number(amount),
            currencyCode: REDEEMABLE_CURRENCY_CODE,
            description: `Withdrawal ${method || 'test'}`
          },
          { transaction: t }
        );
      }
      if (db.Promotion && db.UserPromotionBonus) {
        const applied = await applyWithdrawalBonuses(userId, withdrawalReq.id, Number(amount), redeemableCode, t);
        await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { transaction: t });
        return applied;
      }
      await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { transaction: t });
      return [];
    });
  } catch (txErr) {
    const err = new Error(
      txErr.message || 'Withdrawal could not be completed. Please try again.'
    );
    err.statusCode = txErr.statusCode || 500;
    err.code = txErr.code;
    throw err;
  }

  const full = await getBalance(userId);
  const result = {
    message: 'Withdrawal completed.',
    ...full
  };
  const applied = Array.isArray(promotionBonusesApplied) ? promotionBonusesApplied : [];
  if (applied.length > 0) result.promotion_bonuses_applied = applied;
  return result;
}

module.exports = { withdraw };
