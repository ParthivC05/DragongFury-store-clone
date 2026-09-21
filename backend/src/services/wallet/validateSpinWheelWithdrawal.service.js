'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { getCurrencySetting } = require('./getCurrencySetting.service');
const {
  BONUS_PLAYTHROUGH_MULTIPLIER,
  BONUS_PLAYTHROUGH_STORE_CODE,
  BONUS_PLAYTHROUGH_TX_TYPES,
  isBonusPlaythroughStore
} = require('./bonusPlaythrough.constants');

/** @deprecated Use BONUS_PLAYTHROUGH_MULTIPLIER */
const SPIN_WHEEL_PLAYTHROUGH_MULTIPLIER = BONUS_PLAYTHROUGH_MULTIPLIER;

/** @deprecated Use BONUS_PLAYTHROUGH_STORE_CODE */
const SPIN_WHEEL_PLAYTHROUGH_STORE_CODE = BONUS_PLAYTHROUGH_STORE_CODE;

const DEPOSIT_TX_TYPES = ['deposit', 'deposit_courtesy'];

const BONUS_PLAYTHROUGH_ERROR_PREFIX =
  `Bonus winnings (spin wheel & welcome signup) require ${BONUS_PLAYTHROUGH_MULTIPLIER}× play-through in games before withdrawal.`;

async function isSpinWheelPlaythroughEnabledForUser(userId) {
  const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
  return isBonusPlaythroughStore(user?.storeCode);
}

function buildDisabledSpinWheelWithdrawalSummary(availableRsc) {
  const available = roundMoney(availableRsc);
  return {
    spin_wheel_playthrough_multiplier: BONUS_PLAYTHROUGH_MULTIPLIER,
    spin_wheel_earned_sc: 0,
    spin_wheel_deposited_sc: 0,
    spin_wheel_wagered_sc: 0,
    spin_wheel_max_withdraw_sc: available,
    spin_wheel_remaining_wager_sc: 0,
    spin_wheel_playthrough_applies: false
  };
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function sumUserTransactionAmount(userId, types) {
  if (!db.UserTransaction) return 0;
  const where = { userId };
  if (Array.isArray(types)) {
    where.type = { [Op.in]: types };
  } else {
    where.type = types;
  }
  const total = await db.UserTransaction.sum('amount', { where });
  return roundMoney(total || 0);
}

async function sumGameWagered(userId) {
  if (!db.GameActivity) return 0;
  const total = await db.GameActivity.sum('amount', {
    where: { userId, activityType: 'topup' }
  });
  return roundMoney(total || 0);
}

/**
 * Load lifetime bonus / deposit totals and game wagering for withdrawal checks.
 */
async function getSpinWheelWithdrawalContext(userId) {
  const [bonusPlaythroughEarned, depositedTotal, totalWagered, displayCurrencyCode] = await Promise.all([
    sumUserTransactionAmount(userId, BONUS_PLAYTHROUGH_TX_TYPES),
    sumUserTransactionAmount(userId, DEPOSIT_TX_TYPES),
    sumGameWagered(userId),
    getCurrencySetting()
  ]);

  return {
    spinWheelEarned: bonusPlaythroughEarned,
    depositedTotal,
    totalWagered,
    displayCurrencyCode
  };
}

/**
 * Max RSC the user may withdraw after applying the bonus 5× play-through rule.
 * Deposited funds are not subject to the multiplier; bonus share is proportional.
 */
function calculateSpinWheelMaxWithdrawable({ spinWheelEarned, depositedTotal, totalWagered, availableRsc }) {
  const available = roundMoney(availableRsc);
  const bonusEarned = roundMoney(spinWheelEarned);
  const deposit = roundMoney(depositedTotal);
  const wagered = roundMoney(totalWagered);
  const fundedTotal = bonusEarned + deposit;

  if (available <= 0 || bonusEarned <= 0 || fundedTotal <= 0) {
    return {
      maxWithdrawable: available,
      spinWheelAttributableRsc: 0,
      maxSpinWheelWithdrawable: 0,
      maxDepositWithdrawable: available,
      spinWheelRatio: 0,
      requiredWagerForFullSpinShare: 0,
      remainingWagerForFullSpinShare: 0
    };
  }

  const spinWheelRatio = bonusEarned / fundedTotal;
  const spinWheelAttributableRsc = roundMoney(available * spinWheelRatio);
  const maxSpinWheelWithdrawable = Math.min(
    spinWheelAttributableRsc,
    roundMoney(wagered / BONUS_PLAYTHROUGH_MULTIPLIER)
  );
  const maxDepositWithdrawable = roundMoney(available - spinWheelAttributableRsc);
  const maxWithdrawable = roundMoney(maxDepositWithdrawable + maxSpinWheelWithdrawable);
  const requiredWagerForFullSpinShare = roundMoney(spinWheelAttributableRsc * BONUS_PLAYTHROUGH_MULTIPLIER);
  const remainingWagerForFullSpinShare = roundMoney(
    Math.max(0, requiredWagerForFullSpinShare - wagered)
  );

  return {
    maxWithdrawable,
    spinWheelAttributableRsc,
    maxSpinWheelWithdrawable,
    maxDepositWithdrawable,
    spinWheelRatio,
    requiredWagerForFullSpinShare,
    remainingWagerForFullSpinShare
  };
}

function buildSpinWheelWithdrawalError({
  amount,
  maxWithdrawable,
  remainingWagerForFullSpinShare,
  displayCurrencyCode
}) {
  const currency = displayCurrencyCode || 'SC';
  const maxLabel = maxWithdrawable.toFixed(2);
  const requestedLabel = roundMoney(amount).toFixed(2);

  if (remainingWagerForFullSpinShare > 0) {
    return (
      `${BONUS_PLAYTHROUGH_ERROR_PREFIX} ` +
      `You can withdraw up to ${currency} ${maxLabel} right now (requested ${currency} ${requestedLabel}). ` +
      `Play at least ${currency} ${remainingWagerForFullSpinShare.toFixed(2)} more in games to unlock your full balance.`
    );
  }

  return (
    `${BONUS_PLAYTHROUGH_ERROR_PREFIX} ` +
    `You can withdraw up to ${currency} ${maxLabel} right now (requested ${currency} ${requestedLabel}).`
  );
}

/**
 * Throws a 400 error when the requested withdrawal exceeds bonus play-through limits.
 */
async function assertSpinWheelWithdrawalAllowed(userId, amount, availableRsc) {
  const requested = roundMoney(amount);
  if (!(requested > 0)) return null;

  if (!(await isSpinWheelPlaythroughEnabledForUser(userId))) {
    return null;
  }

  const context = await getSpinWheelWithdrawalContext(userId);
  const limits = calculateSpinWheelMaxWithdrawable({
    ...context,
    availableRsc
  });

  if (requested <= limits.maxWithdrawable + 0.004) {
    return { ...context, ...limits };
  }

  const err = new Error(
    buildSpinWheelWithdrawalError({
      amount: requested,
      maxWithdrawable: limits.maxWithdrawable,
      remainingWagerForFullSpinShare: limits.remainingWagerForFullSpinShare,
      displayCurrencyCode: context.displayCurrencyCode
    })
  );
  err.statusCode = 400;
  err.code = 'SPIN_WHEEL_PLAYTHROUGH_REQUIRED';
  throw err;
}

/**
 * Summary for balance API / UI hints.
 */
async function getSpinWheelWithdrawalSummary(userId, availableRsc) {
  if (!(await isSpinWheelPlaythroughEnabledForUser(userId))) {
    return buildDisabledSpinWheelWithdrawalSummary(availableRsc);
  }

  const context = await getSpinWheelWithdrawalContext(userId);
  const limits = calculateSpinWheelMaxWithdrawable({
    ...context,
    availableRsc
  });

  return {
    spin_wheel_playthrough_multiplier: BONUS_PLAYTHROUGH_MULTIPLIER,
    spin_wheel_earned_sc: context.spinWheelEarned,
    spin_wheel_deposited_sc: context.depositedTotal,
    spin_wheel_wagered_sc: context.totalWagered,
    spin_wheel_max_withdraw_sc: limits.maxWithdrawable,
    spin_wheel_remaining_wager_sc: limits.remainingWagerForFullSpinShare,
    spin_wheel_playthrough_applies:
      context.spinWheelEarned > 0 && limits.maxWithdrawable + 0.004 < roundMoney(availableRsc)
  };
}

module.exports = {
  SPIN_WHEEL_PLAYTHROUGH_MULTIPLIER,
  SPIN_WHEEL_PLAYTHROUGH_STORE_CODE,
  getSpinWheelWithdrawalContext,
  calculateSpinWheelMaxWithdrawable,
  assertSpinWheelWithdrawalAllowed,
  getSpinWheelWithdrawalSummary,
  isSpinWheelPlaythroughEnabledForUser
};
