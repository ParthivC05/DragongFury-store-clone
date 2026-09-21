'use strict';

const db = require('../../db/models');
const { computeBonusAmountFromCode } = require('./bonusCodeMath');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');

/**
 * Apply signup bonus code payout for this deposit. Call inside the same transaction as the deposit.
 * If this returns a non-empty array, promotions must not run for the same deposit.
 * Bonus SC is credited to BSC (not the deposit PSC wallet).
 *
 * @param {number} userId
 * @param {number} depositRequestId
 * @param {number} depositAmount
 * @param {string} currencyCode - unused for wallet credit (kept for call-site compat); grant stored as BSC
 * @param {import('sequelize').Transaction} transaction
 * @returns {Promise<Array<{ bonusCodeId: number, amount: number }>>}
 */
async function applySignupBonusCodeOnDeposit(userId, depositRequestId, depositAmount, currencyCode, transaction) {
  const applied = [];
  const bonusCurrencyCode = BONUS_CURRENCY_CODE;

  if (!db.BonusCode || !db.UserBonusCodeGrant) return applied;

  const user = await db.User.findByPk(userId, {
    attributes: ['signupBonusCodeId', 'storeCode'],
    transaction
  });
  if (!user?.signupBonusCodeId || !user.storeCode) return applied;

  const bonusCode = await db.BonusCode.findOne({
    where: {
      id: user.signupBonusCodeId,
      storeCode: user.storeCode,
      bonusType: 'deposit'
    },
    transaction
  });
  if (!bonusCode || !bonusCode.isActive) return applied;

  // Email campaign codes discount PAY amount at checkout — do not also credit bonus SC.
  if (db.EmailCampaign) {
    const campaignLinked = await db.EmailCampaign.findOne({
      where: { bonusCodeId: bonusCode.id },
      attributes: ['id'],
      transaction
    });
    if (campaignLinked) return applied;
  }

  const minDep = bonusCode.minDeposit != null ? Number(bonusCode.minDeposit) : 0;
  if (depositAmount < minDep) return applied;

  if (bonusCode.claimScope === 'fixed_count') {
    const maxClaims = Number(bonusCode.maxClaimsPerUser) || 0;
    if (maxClaims < 1) return applied;
    const used = await db.UserBonusCodeGrant.count({
      where: { userId, bonusCodeId: bonusCode.id },
      transaction
    });
    if (used >= maxClaims) return applied;
  }

  const bonusAmount = computeBonusAmountFromCode(bonusCode, depositAmount);
  if (bonusAmount <= 0) return applied;

  await creditBonusSc(userId, bonusAmount, {
    transaction,
    ledger: {
      eventType: 'BONUS_CODE',
      bonusType: 'BONUS_CODE',
      sourceType: 'BONUS_CODE',
      sourceId: bonusCode.id,
      paymentId: depositRequestId,
      remarks: `Bonus code ${bonusCode.code || bonusCode.id}`
    }
  });

  await db.UserBonusCodeGrant.create(
    {
      userId,
      bonusCodeId: bonusCode.id,
      depositRequestId,
      amount: bonusAmount,
      currencyCode: bonusCurrencyCode
    },
    { transaction }
  );

  if (db.UserTransaction) {
    await db.UserTransaction.create(
      {
        userId,
        type: 'bonus_code',
        amount: bonusAmount,
        currencyCode: bonusCurrencyCode,
        description: 'Deposit bonus',
        metadata: { bonus_code_id: bonusCode.id, deposit_request_id: depositRequestId }
      },
      { transaction }
    );
  }

  if (db.Notification) {
    const amountStr =
      Number(bonusAmount) === bonusAmount && bonusAmount % 1 === 0
        ? `${bonusAmount}`
        : Number(bonusAmount).toFixed(2);
    await db.Notification.create(
      {
        userId,
        type: 'deposit_bonus',
        title: 'Deposit bonus',
        message: `You received BSC ${amountStr} as a deposit bonus.`,
        actionUrl: '/account/transactions'
      },
      { transaction }
    );
  }

  applied.push({ bonusCodeId: bonusCode.id, amount: bonusAmount });
  return applied;
}

module.exports = { applySignupBonusCodeOnDeposit };
