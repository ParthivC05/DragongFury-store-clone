const { Op } = require('sequelize');
const db = require('../../db/models');
const {
  getNewUserDepositBonusSettingsForUser,
  evaluateProgramEligibility,
  getTierForDepositCount
} = require('./getNewUserDepositBonusSettings.service');

function computeBonusAmount(tier, triggerAmount) {
  const bonusType = (tier.bonusType || '').toLowerCase();
  const value = Number(tier.bonusValue) || 0;
  const cap = tier.maxBonusCap != null ? Number(tier.maxBonusCap) : null;

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

async function hasTierGrant(userId, depositTier, transaction) {
  const count = await db.UserTransaction.count({
    where: {
      userId,
      type: 'promotion',
      [Op.and]: [
        db.sequelize.literal("metadata->>'source' = 'new_user_deposit'"),
        db.sequelize.literal(`metadata->>'deposit_tier' = '${depositTier}'`)
      ]
    },
    transaction
  });
  return count > 0;
}

/**
 * Apply new-user 1st/2nd/3rd deposit bonus from settings. Call inside deposit transaction.
 * @returns {Promise<Array<{ title, amount, deposit_tier }>>}
 */
async function applyNewUserDepositBonus(userId, depositRequestId, depositAmount, depositCount, currencyCode, transaction) {
  // Legacy 1st/2nd/3rd deposit bonuses removed — welcome deposit packages replace them.
  return [];
}

/** Whether user is in the new-user deposit program (skips legacy deposit promotions). */
async function isInNewUserDepositProgram(userId, depositCount) {
  const ctx = await getNewUserDepositBonusSettingsForUser(userId);
  return evaluateProgramEligibility(ctx, depositCount).inProgram;
}

module.exports = {
  applyNewUserDepositBonus,
  isInNewUserDepositProgram,
  computeBonusAmount
};
