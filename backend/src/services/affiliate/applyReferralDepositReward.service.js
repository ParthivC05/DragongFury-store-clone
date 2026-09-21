'use strict';

/**
 * Credit referrer when a referred user completes a deposit.
 * Give/Get: schedule reward after min deposit + playthrough + delay.
 * Classic (commission): pay % of the friend’s first N deposits immediately to the referrer.
 */

const { Op } = require('sequelize');
const db = require('../../db/models');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');
const { addVipXp } = require('../vip/addVipXp.service');
const { getEffectiveSettingsForStoreCode } = require('./getAffiliateSettings.service');
const { REWARD_STATUS } = require('./giveGetReferral.constants');

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function applyGiveGetReferralDepositReward(
  referredUserId,
  depositReq,
  transaction,
  user,
  affiliateSettings
) {
  const amount = Number(depositReq.amount);
  const minDeposit = Number(affiliateSettings.minQualifyingDepositUsd) || 0;
  if (!(amount >= minDeposit)) return;

  const referrerId = user.userReferredBy;
  const referrerRewardSc = Number(affiliateSettings.referrerRewardSc) || 0;
  if (!(referrerRewardSc > 0)) return;

  const delayHours = Number(affiliateSettings.payoutDelayHours) || 0;
  const payoutDelayMinutes = Math.round(delayHours * 60);

  const existingForPair = await db.ReferralDepositReward.findOne({
    where: {
      referrerUserId: referrerId,
      referredUserId,
      [Op.or]: [
        {
          status: {
            [Op.in]: [
              REWARD_STATUS.AWAITING_PLAYTHROUGH,
              REWARD_STATUS.SCHEDULED,
              REWARD_STATUS.CAPPED
            ]
          }
        },
        {
          status: REWARD_STATUS.PAID,
          amount: { [Op.gte]: referrerRewardSc }
        }
      ]
    },
    transaction
  });
  if (existingForPair) return;

  const payoutAt = new Date(Date.now() + payoutDelayMinutes * 60 * 1000);

  await db.ReferralDepositReward.create(
    {
      referrerUserId: referrerId,
      referredUserId,
      depositRequestId: depositReq.id,
      amount: referrerRewardSc,
      status: REWARD_STATUS.AWAITING_PLAYTHROUGH,
      payoutAt,
      playthroughAt: null,
      creditedAt: null
    },
    { transaction }
  );
}

async function applyClassicReferralDepositReward(
  referredUserId,
  depositReq,
  transaction,
  user,
  affiliateSettings
) {
  const amount = Number(depositReq.amount);
  const minDeposit = Number(affiliateSettings.minQualifyingDepositUsd) || 0;
  if (minDeposit > 0 && !(amount >= minDeposit)) return;

  const referrerId = user.userReferredBy;
  const percent = Number(affiliateSettings.rewardPercentage) || 0;
  const maxN = Math.round(Number(affiliateSettings.maxRewardsPerReferral) || 0);
  if (!(percent > 0) || !(maxN > 0)) return;

  const alreadyCount = await db.ReferralDepositReward.count({
    where: {
      referrerUserId: referrerId,
      referredUserId
    },
    transaction
  });
  if (alreadyCount >= maxN) return;

  let rewardAmount = round2(amount * (percent / 100));
  const maxSc = Number(affiliateSettings.rewardMaxSc) || 0;
  if (maxSc > 0) rewardAmount = Math.min(rewardAmount, maxSc);
  if (!(rewardAmount > 0)) return;

  const now = new Date();
  const reward = await db.ReferralDepositReward.create(
    {
      referrerUserId: referrerId,
      referredUserId,
      depositRequestId: depositReq.id,
      amount: rewardAmount,
      status: REWARD_STATUS.PAID,
      payoutAt: now,
      playthroughAt: now,
      creditedAt: now
    },
    { transaction }
  );

  await creditBonusSc(referrerId, rewardAmount, {
    transaction,
    ledger: {
      eventType: 'REFERRAL_BONUS',
      bonusType: 'REFERRAL_BONUS',
      sourceType: 'REFERRAL_DEPOSIT',
      sourceId: depositReq.id,
      paymentId: depositReq.id,
      remarks: 'Referral commission'
    }
  });

  const currencyCode = BONUS_CURRENCY_CODE;
  await db.UserTransaction.create(
    {
      userId: referrerId,
      type: 'affiliate',
      amount: rewardAmount,
      currencyCode,
      description: `Referral commission (${percent}% of deposit)`,
      metadata: {
        program: 'classic',
        referred_user_id: referredUserId,
        deposit_request_id: depositReq.id,
        reward_id: reward.id,
        reward_percentage: percent,
        deposit_amount: amount,
        deposit_index: alreadyCount + 1,
        max_rewards_per_referral: maxN
      }
    },
    { transaction }
  );

  if (db.VipLedger) {
    await addVipXp(referrerId, rewardAmount, 'referral', reward.id, transaction);
  }

  if (db.Notification) {
    const amountStr =
      Number(rewardAmount) === rewardAmount && rewardAmount % 1 === 0
        ? `${rewardAmount}`
        : rewardAmount.toFixed(2);
    await db.Notification.create(
      {
        userId: referrerId,
        type: 'affiliate_reward',
        title: 'Referral commission',
        message: `You earned ${currencyCode} ${amountStr} (${percent}% of your friend’s deposit).`,
        actionUrl: '/account/affiliate'
      },
      { transaction }
    );
  }
}

async function applyReferralDepositReward(referredUserId, depositReq, transaction) {
  if (!depositReq?.id || !db.ReferralDepositReward || !db.UserTransaction) return;

  const depositStatus = (depositReq.status && String(depositReq.status).toLowerCase()) || '';
  if (depositStatus !== 'completed') return;

  const amount = Number(depositReq.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const existingForDeposit = await db.ReferralDepositReward.findOne({
    where: { depositRequestId: depositReq.id },
    transaction
  });
  if (existingForDeposit) return;

  const user = await db.User.findByPk(referredUserId, {
    attributes: ['userReferredBy', 'distributorCode', 'storeCode'],
    transaction
  });
  const referrerId = user?.userReferredBy ? user.userReferredBy : null;
  if (!referrerId) return;

  let storeCode = user.storeCode;
  if (!storeCode) {
    const referrer = await db.User.findByPk(referrerId, {
      attributes: ['storeCode'],
      transaction
    });
    storeCode = referrer?.storeCode || null;
  }
  if (!storeCode) return;

  const affiliateSettings = await getEffectiveSettingsForStoreCode(storeCode);
  const ctx = { userReferredBy: referrerId, storeCode, distributorCode: user.distributorCode };

  if (affiliateSettings.programMode === 'classic' || affiliateSettings.isClassic) {
    await applyClassicReferralDepositReward(
      referredUserId,
      depositReq,
      transaction,
      ctx,
      affiliateSettings
    );
    return;
  }

  await applyGiveGetReferralDepositReward(
    referredUserId,
    depositReq,
    transaction,
    ctx,
    affiliateSettings
  );
}

module.exports = { applyReferralDepositReward };
