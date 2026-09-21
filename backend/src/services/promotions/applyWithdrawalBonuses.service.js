const db = require('../../db/models');

/**
 * Compute bonus amount from promotion rule. For withdrawal we use fixed or a percentage of withdrawal.
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
 * Apply eligible promotion bonuses for a withdrawal (e.g. "withdraw 1K get X bonus").
 * Call inside the same transaction as the withdrawal.
 * @param {number} userId
 * @param {number} withdrawalRequestId
 * @param {number} withdrawalAmount
 * @param {string} currencyCode
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<Array<{ promotionId, title, amount }>>} applied bonuses
 */
async function applyWithdrawalBonuses(userId, withdrawalRequestId, withdrawalAmount, currencyCode, transaction) {
  const applied = [];

  const promotions = await db.Promotion.findAll({
    where: {
      isActive: true,
      bonusTriggerType: 'withdrawal_threshold'
    },
    transaction
  });

  for (const promo of promotions) {
    const minAmount = promo.minTriggerAmount != null ? Number(promo.minTriggerAmount) : 0;
    if (withdrawalAmount < minAmount) continue;

    const existing = await db.UserPromotionBonus.findOne({
      where: {
        userId,
        promotionId: promo.id,
        referenceType: 'withdrawal',
        referenceId: withdrawalRequestId
      },
      transaction
    });
    if (existing) continue;

    const bonusAmount = computeBonusAmount(promo, withdrawalAmount);
    if (bonusAmount <= 0) continue;

    const wallet = await db.Wallet.findOne({
      where: { userId, currencyCode },
      transaction
    });
    if (!wallet) continue;

    const balance = Number(wallet.balance) || 0;
    await wallet.update(
      { balance: balance + bonusAmount },
      { transaction }
    );
    const { recordWalletChange } = require('../wallet/scLedger.service');
    await wallet.reload({ transaction });
    await recordWalletChange({
      userId,
      currencyCode,
      direction: 'CREDIT',
      amount: bonusAmount,
      wallet,
      ledger: {
        eventType: 'OTHER_BONUS',
        bonusType: 'OTHER_BONUS',
        sourceType: 'PROMOTION',
        sourceId: promo.id,
        remarks: promo.title || 'Withdrawal promotion bonus'
      },
      transaction
    });

    await db.UserPromotionBonus.create(
      {
        userId,
        promotionId: promo.id,
        referenceType: 'withdrawal',
        referenceId: withdrawalRequestId,
        amount: bonusAmount
      },
      { transaction }
    );

    if (db.UserTransaction) {
      await db.UserTransaction.create(
        {
          userId,
          type: 'promotion',
          amount: bonusAmount,
          currencyCode,
          description: `Promotion bonus: ${promo.title}`,
          metadata: { promotion_id: promo.id, withdrawal_request_id: withdrawalRequestId }
        },
        { transaction }
      );
    }

    if (db.Notification) {
      const amountStr = Number(bonusAmount) === bonusAmount && bonusAmount % 1 === 0
        ? `${bonusAmount}`
        : Number(bonusAmount).toFixed(2);
      await db.Notification.create(
        {
          userId,
          type: 'promotion_bonus',
          title: 'Promotion bonus',
          message: `You received ${currencyCode} ${amountStr} from ${promo.title}!`,
          actionUrl: '/promotions'
        },
        { transaction }
      );
    }

    applied.push({ promotionId: promo.id, title: promo.title, amount: bonusAmount });
  }

  return applied;
}

module.exports = { applyWithdrawalBonuses, computeBonusAmount };
