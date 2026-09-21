const db = require('../../db/models');
const { Op } = require('sequelize');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');

/**
 * Statuses that consume daily withdrawal allowance.
 * Rejected / cancelled / expired unpaid do not count.
 */
const COUNT_STATUSES = [
  'pending',
  'processing',
  'approved',
  'completed',
  'success',
  'active',
  'paid'
];

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function sumAmount(Model, where, transaction) {
  if (!Model) return 0;
  const total = await Model.sum('amount', {
    where,
    ...(transaction ? { transaction } : {})
  });
  return roundMoney(total || 0);
}

/**
 * Sum of a user's withdrawal amounts that count toward today's daily limit (UTC calendar day).
 * Includes pending + completed from withdrawal_requests, chime, and speed (when present).
 */
async function getDailyWithdrawnAmount(userId, dayStart = startOfUtcDay(), options = {}) {
  const transaction = options.transaction || null;
  const whereBase = {
    userId,
    status: { [Op.in]: COUNT_STATUSES },
    created_at: { [Op.gte]: dayStart }
  };

  const sums = await Promise.all([
    sumAmount(db.WithdrawalRequest, whereBase, transaction),
    sumAmount(db.ChimeCashappWithdrawalRequest, whereBase, transaction),
    db.SpeedWithdrawRequest
      ? sumAmount(
          db.SpeedWithdrawRequest,
          {
            userId,
            status: { [Op.in]: ['active', 'paid', 'completed', 'success', 'pending', 'processing'] },
            created_at: { [Op.gte]: dayStart }
          },
          transaction
        )
      : Promise.resolve(0)
  ]);

  return roundMoney(sums.reduce((a, b) => a + b, 0));
}

/**
 * Effective daily cap + usage for a user. dailyWithdrawMax null/0 = unlimited.
 */
async function getDailyWithdrawalUsage(userId, options = {}) {
  const [limits, currency, withdrawnToday] = await Promise.all([
    getWalletLimitsForUser(userId),
    getCurrencySetting().catch(() => 'SC'),
    getDailyWithdrawnAmount(userId, startOfUtcDay(), options)
  ]);
  const dailyWithdrawMax = limits.dailyWithdrawMax != null && Number(limits.dailyWithdrawMax) > 0
    ? roundMoney(limits.dailyWithdrawMax)
    : null;
  const remaining = dailyWithdrawMax == null
    ? null
    : roundMoney(Math.max(0, dailyWithdrawMax - withdrawnToday));

  return {
    dailyWithdrawMax,
    dailyWithdrawnToday: withdrawnToday,
    dailyWithdrawRemaining: remaining,
    currency: limits.currency || currency,
    dailyWithdrawMaxSource: limits.dailyWithdrawMaxSource || 'global'
  };
}

/**
 * Throw 400 if amount would exceed the store's daily withdrawal limit for this user.
 * No-op when dailyWithdrawMax is unset / 0 (unlimited) — preserves existing behavior.
 *
 * @param {number} userId
 * @param {number} amount
 * @param {{ displayCurrency?: string, usage?: object, transaction?: object }} [options]
 */
async function assertDailyWithdrawalLimit(userId, amount, options = {}) {
  const requested = roundMoney(amount);
  if (!Number.isFinite(requested) || requested <= 0) return null;

  const usage = options.usage
    ? options.usage
    : await getDailyWithdrawalUsage(userId, { transaction: options.transaction });

  const dailyMax = usage.dailyWithdrawMax;
  if (dailyMax == null || dailyMax <= 0) return usage;

  const currency = options.displayCurrency || usage.currency || 'SC';
  const remaining = usage.dailyWithdrawRemaining != null
    ? usage.dailyWithdrawRemaining
    : roundMoney(Math.max(0, dailyMax - (usage.dailyWithdrawnToday || 0)));

  if (requested <= remaining + 0.004) return usage;

  const withdrawn = roundMoney(usage.dailyWithdrawnToday || 0);
  const err = new Error(
    remaining <= 0
      ? `You have reached your daily withdrawal limit of ${currency} ${dailyMax.toFixed(2)}. Please try again tomorrow.`
      : `Your daily withdrawal limit is ${currency} ${dailyMax.toFixed(2)}. You can withdraw ${currency} ${remaining.toFixed(2)} more today (already used ${currency} ${withdrawn.toFixed(2)}).`
  );
  err.statusCode = 400;
  err.code = 'DAILY_WITHDRAWAL_LIMIT';
  err.dailyWithdrawMax = dailyMax;
  err.dailyWithdrawnToday = withdrawn;
  err.dailyWithdrawRemaining = remaining;
  throw err;
}

/**
 * Serialize concurrent withdrawal attempts: lock the user's redeemable wallet row,
 * then re-check the daily cap. Use before external provider calls and again before insert.
 */
async function assertDailyWithdrawalLimitUnderWalletLock(userId, amount, options = {}) {
  const displayCurrency = options.displayCurrency || null;
  return db.sequelize.transaction(async (t) => {
    let wallet = await db.Wallet.findOne({
      where: { userId, currencyCode: REDEEMABLE_CURRENCY_CODE },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!wallet) {
      await db.Wallet.create(
        { userId, currencyCode: REDEEMABLE_CURRENCY_CODE, balance: 0, playBalance: 0, frozenBalance: 0 },
        { transaction: t }
      );
      wallet = await db.Wallet.findOne({
        where: { userId, currencyCode: REDEEMABLE_CURRENCY_CODE },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }
    return assertDailyWithdrawalLimit(userId, amount, {
      displayCurrency,
      transaction: t
    });
  });
}

module.exports = {
  assertDailyWithdrawalLimit,
  assertDailyWithdrawalLimitUnderWalletLock,
  getDailyWithdrawalUsage,
  getDailyWithdrawnAmount,
  startOfUtcDay,
  COUNT_STATUSES
};
