const db = require('../../db/models');

const DEPOSIT_TRIGGERS = ['first_deposit', 'second_deposit', 'third_deposit', 'welcome'];

/**
 * Get deposit count for user (including the one just created).
 */
async function getDepositCount(userId, transaction) {
  const count = await db.DepositRequest.count({
    where: { userId, status: 'completed' },
    transaction
  });
  return count;
}

/**
 * Compute bonus amount from promotion rule and trigger amount.
 */
function computeBonusAmount(promotion, triggerAmount) {
  const bonusType = (promotion.bonusType || '').toLowerCase();
  const value = Number(promotion.bonusValue) || 0;
  const cap = promotion.maxBonusCap != null ? Number(promotion.maxBonusCap) : null;

  if (bonusType === 'percentage') {
    let amount = Math.round((triggerAmount * value) / 100 * 100) / 100;
    if (cap != null && cap > 0 && amount > cap) amount = Number(cap);
    return amount;
  }
  if (bonusType === 'fixed') {
    return Math.min(Number(value) || 0, 999999999);
  }
  return 0;
}

/**
 * Apply eligible promotion bonuses for a deposit. Call inside the same transaction as the deposit.
 * @param {number} userId
 * @param {number} depositRequestId
 * @param {number} depositAmount
 * @param {number} depositCount - total completed deposit count for this user (after this deposit)
 * @param {string} currencyCode
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<Array<{ promotionId, title, amount }>>} applied bonuses
 */
async function applyDepositBonuses(userId, depositRequestId, depositAmount, depositCount, currencyCode, transaction) {
  // Legacy 1st/2nd/3rd deposit bonuses removed — welcome deposit packages replace them.
  return [];
}

module.exports = { applyDepositBonuses, getDepositCount, computeBonusAmount };
