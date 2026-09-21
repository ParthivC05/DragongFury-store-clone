'use strict';

const db = require('../../db/models');
const {
  getAffiliateSettings,
  getEffectiveSettingsForStoreCode
} = require('./getAffiliateSettings.service');
const {
  buildAffiliateRewardDescription,
  buildAffiliateHowItWorksSteps
} = require('./buildAffiliateUserCopy.service');
const { getResolvedUserSiteBaseUrl } = require('../store/userSiteUrl.service');
const { REWARD_STATUS } = require('./giveGetReferral.constants');
const {
  getWeeklyReferralEarnedSc,
  getWeeklyReferralRemainingSc,
  creditDueGiveGetReferralRewardsForReferrer
} = require('./creditGiveGetReferralReward.service');

async function getAffiliateStats(userId) {
  const user = await db.User.findByPk(userId, {
    attributes: ['userId', 'username', 'userReferralCode', 'distributorCode', 'storeCode']
  });
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  const referralCode = user.userReferralCode || '';
  // Prefer store-code lookup so Give/Get amounts (incl. min deposit) always match admin settings.
  const settings = user.storeCode
    ? await getEffectiveSettingsForStoreCode(user.storeCode)
    : await getAffiliateSettings(
        user.distributorCode != null
          ? { distributorCode: user.distributorCode, storeCode: null }
          : null
      );
  const giveGet = settings.programMode !== 'classic' && settings.isClassic !== true;
  const referrerRewardSc = Number(settings.referrerRewardSc) || 0;
  const weeklyCapSc = Number(settings.weeklyCapSc) || 0;
  const rewardPercentage = Number(settings.rewardPercentage) || 0;
  const maxRewardedPurchases = Math.round(Number(settings.maxRewardsPerReferral) || (giveGet ? 1 : 3));

  // Safety net: pay any due scheduled rewards even if the cron isn't running.
  try {
    await creditDueGiveGetReferralRewardsForReferrer(userId);
  } catch (e) {
    console.error('creditDueGiveGetReferralRewardsForReferrer failed:', e?.message || e);
  }

  const referredUsers = await db.User.findAll({
    where: { userReferredBy: userId },
    attributes: ['userId', 'username', 'email', 'createdAt'],
    order: [['createdAt', 'DESC']]
  });

  const totalEarned =
    (db.UserTransaction &&
      (await db.UserTransaction.sum('amount', {
        where: { userId, type: 'affiliate' }
      }))) ||
    0;

  const currency = settings.currency || 'SC';
  const rewardDescription = buildAffiliateRewardDescription(settings, currency, user.storeCode);
  const howItWorksSteps = buildAffiliateHowItWorksSteps(settings, currency, user.storeCode);

  const rewardRows = db.ReferralDepositReward
    ? await db.ReferralDepositReward.findAll({
        where: { referrerUserId: userId },
        order: [['created_at', 'DESC']],
        limit: 100
      })
    : [];

  const rewardByReferred = new Map();
  for (const r of rewardRows || []) {
    const amount = Number(r.amount);
    if (giveGet && r.status === REWARD_STATUS.PAID && referrerRewardSc > 0 && amount < referrerRewardSc) {
      continue;
    }
    if (!rewardByReferred.has(r.referredUserId)) {
      rewardByReferred.set(r.referredUserId, r);
    }
  }

  const paidCountByReferred = new Map();
  if (!giveGet) {
    for (const r of rewardRows || []) {
      if (r.status === REWARD_STATUS.PAID) {
        const id = r.referredUserId;
        paidCountByReferred.set(id, (paidCountByReferred.get(id) || 0) + 1);
      }
    }
  }

  const referredList = (referredUsers || []).map((u) => {
    const reward = rewardByReferred.get(u.userId);
    let qualification_status = 'signed_up';
    if (!giveGet) {
      const paidCount = paidCountByReferred.get(u.userId) || 0;
      if (paidCount >= maxRewardedPurchases) qualification_status = 'complete';
      else if (paidCount > 0) qualification_status = 'earning';
    } else if (reward) {
      if (reward.status === REWARD_STATUS.PAID) qualification_status = 'paid';
      else if (reward.status === REWARD_STATUS.CAPPED) qualification_status = 'capped';
      else if (reward.status === REWARD_STATUS.SCHEDULED) qualification_status = 'scheduled';
      else if (reward.status === REWARD_STATUS.AWAITING_PLAYTHROUGH) {
        qualification_status = 'awaiting_playthrough';
      }
    }
    return {
      user_id: u.userId,
      username: u.username || '',
      email: u.email ? u.email.replace(/^(.{2}).*@/, '$1***@') : '',
      joined_at: u.createdAt || null,
      qualification_status,
      payout_at: reward?.payoutAt || null,
      reward_status: reward?.status || null,
      rewarded_deposits: giveGet ? (reward?.status === REWARD_STATUS.PAID ? 1 : 0) : (paidCountByReferred.get(u.userId) || 0),
      max_rewarded_deposits: giveGet ? 1 : maxRewardedPurchases
    };
  });

  const earningsList = [];
  const pendingList = [];
  const referredIds = [...new Set((rewardRows || []).map((r) => r.referredUserId))];
  const users = referredIds.length
    ? await db.User.findAll({
        where: { userId: referredIds },
        attributes: ['userId', 'username', 'email']
      })
    : [];
  const userMap = new Map(users.map((u) => [u.userId, u]));

  for (const r of rewardRows || []) {
    const referred = userMap.get(r.referredUserId);
    const amount = Number(r.amount);
    if (giveGet && referrerRewardSc > 0 && amount > 0 && amount < referrerRewardSc && r.status === REWARD_STATUS.PAID) {
      continue;
    }
    const base = {
      referred_user_id: r.referredUserId,
      username: referred?.username || '',
      email: referred?.email ? referred.email.replace(/^(.{2}).*@/, '$1***@') : '',
      amount,
      status: r.status || REWARD_STATUS.PAID,
      created_at: r.created_at,
      payout_at: r.payoutAt || null,
      credited_at: r.creditedAt || null
    };
    if (r.status === REWARD_STATUS.PAID || (!giveGet && !r.status)) {
      earningsList.push({
        ...base,
        created_at: r.creditedAt || r.created_at
      });
    } else if (
      r.status === REWARD_STATUS.AWAITING_PLAYTHROUGH ||
      r.status === REWARD_STATUS.SCHEDULED
    ) {
      pendingList.push(base);
    }
  }

  let weekly_earned_sc = 0;
  let weekly_remaining_sc = weeklyCapSc;
  if (giveGet) {
    weekly_earned_sc = await getWeeklyReferralEarnedSc(userId);
    weekly_remaining_sc = await getWeeklyReferralRemainingSc(userId, null, weeklyCapSc);
  }

  const referral_site_base_url = await getResolvedUserSiteBaseUrl(user.storeCode);
  return {
    referral_code: referralCode,
    referral_site_base_url,
    referral_link: referralCode
      ? `${referral_site_base_url}/register?ref=${encodeURIComponent(referralCode)}`
      : '',
    total_referrals: referredUsers.length,
    total_earned_sc: Number(totalEarned) || 0,
    currency,
    program_mode: giveGet ? 'give_get' : 'classic',
    friend_signup_bonus_sc: Number(settings.friendSignupBonusSc) || 0,
    referrer_reward_sc: referrerRewardSc,
    reward_percentage: rewardPercentage,
    max_rewarded_purchases: maxRewardedPurchases,
    min_qualifying_deposit_usd: Number(settings.minQualifyingDepositUsd) || 0,
    payout_delay_hours: Number(settings.payoutDelayHours) || 0,
    payout_delay_minutes: Number(settings.payoutDelayMinutes) || 0,
    weekly_cap_sc: giveGet ? weeklyCapSc : 0,
    weekly_earned_sc,
    weekly_remaining_sc,
    reward_description: rewardDescription,
    how_it_works_steps: howItWorksSteps,
    referred_users: referredList,
    earnings: earningsList,
    pending_rewards: pendingList
  };
}

module.exports = { getAffiliateStats };
