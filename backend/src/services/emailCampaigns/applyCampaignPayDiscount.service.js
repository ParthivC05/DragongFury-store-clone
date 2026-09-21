'use strict';

const db = require('../../db/models');
const { EMAIL_CAMPAIGN_STORE_CODE, normalizeStoreCode } = require('./constants');

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Active email-campaign pay discount for a user (claimed + applied, not yet redeemed).
 * @returns {Promise<null|{ sendId:number, bonusCodeId:number, code:string, valueType:'percentage'|'fixed', value:number, campaignId:number }>}
 */
async function getActiveCampaignPayDiscount(userId, options = {}) {
  const transaction = options.transaction || null;
  if (!userId || !db.EmailCampaignSend) return null;

  const send = await db.EmailCampaignSend.findOne({
    where: {
      userId,
      claimStatus: 'claimed'
    },
    include: [{ model: db.EmailCampaign, as: 'Campaign' }],
    order: [['claimedAt', 'DESC']],
    transaction
  });

  if (!send?.Campaign || !send.codeAppliedAt) return null;
  if (normalizeStoreCode(send.Campaign.storeCode) !== EMAIL_CAMPAIGN_STORE_CODE) return null;
  if (!send.Campaign.bonusCodeId) return null;

  if (db.UserBonusCodeGrant) {
    const used = await db.UserBonusCodeGrant.count({
      where: { userId, bonusCodeId: send.Campaign.bonusCodeId },
      transaction
    });
    if (used >= 1) return null;
  }

  const bonus = await db.BonusCode.findByPk(send.Campaign.bonusCodeId, { transaction });
  if (!bonus || !bonus.isActive) return null;

  const valueTypeRaw = String(bonus.valueType || send.Campaign.discountValueType || 'fixed').toLowerCase();
  const valueType = valueTypeRaw === 'percent' || valueTypeRaw === 'percentage' ? 'percentage' : 'fixed';
  const value = Number(bonus.value != null ? bonus.value : send.Campaign.discountValue) || 0;
  if (!(value > 0)) return null;

  const minDeposit =
    bonus.minDeposit != null
      ? Number(bonus.minDeposit)
      : send.Campaign.discountMinDeposit != null
        ? Number(send.Campaign.discountMinDeposit)
        : 0;

  return {
    sendId: send.id,
    campaignId: send.campaignId,
    bonusCodeId: bonus.id,
    code: String(bonus.code || send.discountCodeSnapshot || '').toUpperCase(),
    valueType,
    value,
    minDeposit: Number.isFinite(minDeposit) ? minDeposit : 0,
    maxBonusCap:
      bonus.maxBonusCap != null
        ? Number(bonus.maxBonusCap)
        : send.Campaign.discountMaxBonusCap != null
          ? Number(send.Campaign.discountMaxBonusCap)
          : null
  };
}

/**
 * Lower the PAY amount (not SC credit). Percentage or fixed $ off.
 * @param {number} basePay
 * @param {{ valueType:string, value:number, minDeposit?:number, maxBonusCap?:number|null }} discount
 */
function computeCampaignPayDiscount(basePay, discount) {
  const base = roundMoney(basePay);
  if (!(base > 0) || !discount) {
    return { payAmount: base, discountAmount: 0, applied: false };
  }
  if (discount.minDeposit > 0 && base < discount.minDeposit) {
    return { payAmount: base, discountAmount: 0, applied: false };
  }

  let discountAmount = 0;
  if (discount.valueType === 'percentage') {
    discountAmount = roundMoney((base * discount.value) / 100);
    if (discount.maxBonusCap != null && discount.maxBonusCap > 0 && discountAmount > discount.maxBonusCap) {
      discountAmount = roundMoney(discount.maxBonusCap);
    }
  } else {
    discountAmount = roundMoney(Math.min(discount.value, base - 0.01));
  }

  if (!(discountAmount > 0)) {
    return { payAmount: base, discountAmount: 0, applied: false };
  }

  let payAmount = roundMoney(base - discountAmount);
  if (payAmount < 0.01) payAmount = 0.01;
  discountAmount = roundMoney(base - payAmount);

  return {
    payAmount,
    discountAmount,
    applied: discountAmount > 0,
    valueType: discount.valueType,
    value: discount.value,
    code: discount.code,
    sendId: discount.sendId,
    bonusCodeId: discount.bonusCodeId,
    campaignId: discount.campaignId,
    originalPayAmount: base
  };
}

/**
 * Apply active campaign pay discount for user onto a base pay amount.
 */
async function applyCampaignPayDiscountForUser(userId, basePay, options = {}) {
  const active = await getActiveCampaignPayDiscount(userId, options);
  if (!active) {
    return { payAmount: roundMoney(basePay), discountAmount: 0, applied: false };
  }
  return computeCampaignPayDiscount(basePay, active);
}

/**
 * Mark campaign pay discount redeemed after successful deposit (one-time).
 */
async function redeemCampaignPayDiscount(userId, meta, options = {}) {
  const transaction = options.transaction || null;
  const bonusCodeId = meta?.emailCampaignBonusCodeId ?? meta?.bonusCodeId;
  const sendId = meta?.emailCampaignSendId ?? meta?.sendId;
  const discountAmount = Number(meta?.emailCampaignDiscountAmount ?? meta?.discountAmount) || 0;
  if (!userId || !bonusCodeId || !db.UserBonusCodeGrant) return;

  const existing = await db.UserBonusCodeGrant.count({
    where: { userId, bonusCodeId },
    transaction
  });
  if (existing >= 1) return;

  await db.UserBonusCodeGrant.create(
    {
      userId,
      bonusCodeId,
      depositRequestId: options.depositRequestId || null,
      amount: discountAmount,
      currencyCode: options.currencyCode || 'USD'
    },
    { transaction }
  );

  if (sendId && db.EmailCampaignSend) {
    const send = await db.EmailCampaignSend.findByPk(sendId, { transaction });
    if (send && send.userId === userId && !send.codeAppliedAt) {
      /* already cleared */
    }
    // Keep codeAppliedAt for audit; grant is the redemption lock.
  }

  // Clear signup bonus link so no SC bonus path fires later.
  if (db.User) {
    const user = await db.User.findByPk(userId, {
      attributes: ['userId', 'signupBonusCodeId'],
      transaction
    });
    if (user && user.signupBonusCodeId === bonusCodeId) {
      await user.update({ signupBonusCodeId: null }, { transaction });
    }
  }
}

function campaignDiscountMetadata(applied) {
  if (!applied?.applied) return {};
  return {
    emailCampaignSendId: applied.sendId,
    emailCampaignBonusCodeId: applied.bonusCodeId,
    emailCampaignCode: applied.code,
    emailCampaignDiscountType: applied.valueType,
    emailCampaignDiscountValue: applied.value,
    emailCampaignDiscountAmount: applied.discountAmount,
    emailCampaignOriginalPayAmount: applied.originalPayAmount
  };
}

module.exports = {
  getActiveCampaignPayDiscount,
  computeCampaignPayDiscount,
  applyCampaignPayDiscountForUser,
  redeemCampaignPayDiscount,
  campaignDiscountMetadata,
  roundMoney
};
