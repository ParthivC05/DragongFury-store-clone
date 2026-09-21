'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc, ensureWallet } = require('../wallet/walletBuckets.service');
const { addVipXp } = require('../vip/addVipXp.service');
const { REFERRER_REWARD_SC, WEEKLY_CAP_SC, REWARD_STATUS } = require('./giveGetReferral.constants');
const { getEffectiveSettingsForStoreCode } = require('./getAffiliateSettings.service');

function weekAgoDate() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function getWeeklyReferralEarnedSc(referrerUserId, transaction) {
  if (!db.ReferralDepositReward) return 0;
  const total = await db.ReferralDepositReward.sum('amount', {
    where: {
      referrerUserId,
      status: REWARD_STATUS.PAID,
      creditedAt: { [Op.gte]: weekAgoDate() }
    },
    transaction
  });
  return Math.round((Number(total) || 0) * 100) / 100;
}

async function resolveWeeklyCapForReferrer(referrerUserId, transaction) {
  const referrer = await db.User.findByPk(referrerUserId, {
    attributes: ['storeCode'],
    transaction
  });
  if (!referrer?.storeCode) return WEEKLY_CAP_SC;
  const settings = await getEffectiveSettingsForStoreCode(referrer.storeCode);
  const cap = Number(settings.weeklyCapSc);
  return Number.isFinite(cap) && cap >= 0 ? cap : WEEKLY_CAP_SC;
}

async function getWeeklyReferralRemainingSc(referrerUserId, transaction, weeklyCapSc = null) {
  const cap =
    weeklyCapSc != null && Number.isFinite(Number(weeklyCapSc))
      ? Number(weeklyCapSc)
      : await resolveWeeklyCapForReferrer(referrerUserId, transaction);
  const earned = await getWeeklyReferralEarnedSc(referrerUserId, transaction);
  return Math.max(0, Math.round((cap - earned) * 100) / 100);
}

/**
 * Credit a scheduled Give/Get referral reward when payout_at has passed and weekly cap allows.
 */
async function creditGiveGetReferralReward(reward, transaction) {
  if (!reward || reward.status === REWARD_STATUS.PAID) return null;
  if (reward.status === REWARD_STATUS.CAPPED) return 'capped';
  if (reward.status !== REWARD_STATUS.SCHEDULED) return 'skipped';

  const payoutAt = reward.payoutAt ? new Date(reward.payoutAt) : null;
  if (payoutAt && payoutAt.getTime() > Date.now()) return 'skipped';

  const currencyCode = BONUS_CURRENCY_CODE;
  const referrerWallet = await ensureWallet(reward.referrerUserId, currencyCode, transaction);
  if (!referrerWallet) return 'skipped';

  const weeklyCapSc = await resolveWeeklyCapForReferrer(reward.referrerUserId, transaction);
  const remaining = await getWeeklyReferralRemainingSc(
    reward.referrerUserId,
    transaction,
    weeklyCapSc
  );
  const requested = Number(reward.amount) || REFERRER_REWARD_SC;
  const creditAmount = Math.min(requested, remaining);

  if (!(creditAmount > 0)) {
    await reward.update(
      {
        status: REWARD_STATUS.CAPPED,
        skipReason: 'weekly_cap',
        amount: 0
      },
      { transaction }
    );
    return 'capped';
  }

  await creditBonusSc(reward.referrerUserId, creditAmount, {
    transaction,
    ledger: {
      eventType: 'REFERRAL_BONUS',
      bonusType: 'REFERRAL_BONUS',
      sourceType: 'GIVE_GET',
      sourceId: reward.id,
      remarks: 'Referral reward (Give / Get)'
    }
  });

  await db.UserTransaction.create(
    {
      userId: reward.referrerUserId,
      type: 'affiliate',
      amount: creditAmount,
      currencyCode,
      description: 'Referral reward (Give / Get)',
      metadata: {
        program: 'give_get',
        referred_user_id: reward.referredUserId,
        deposit_request_id: reward.depositRequestId,
        reward_id: reward.id,
        weekly_cap_sc: weeklyCapSc
      }
    },
    { transaction }
  );

  const now = new Date();
  await reward.update(
    {
      status: REWARD_STATUS.PAID,
      amount: creditAmount,
      creditedAt: now,
      skipReason: creditAmount < requested ? 'partial_weekly_cap' : null
    },
    { transaction }
  );

  if (db.VipLedger) {
    await addVipXp(reward.referrerUserId, creditAmount, 'referral', reward.id, transaction);
  }

  if (db.Notification) {
    const amountStr =
      Number(creditAmount) === creditAmount && creditAmount % 1 === 0
        ? `${creditAmount}`
        : Number(creditAmount).toFixed(2);
    await db.Notification.create(
      {
        userId: reward.referrerUserId,
        type: 'affiliate_reward',
        title: 'Referral reward',
        message: `You earned ${currencyCode} ${amountStr} from a referral!`,
        actionUrl: '/account/affiliate'
      },
      { transaction }
    );
  }

  return 'paid';
}

async function creditDueGiveGetReferralRewards({ limit = 100 } = {}) {
  if (!db.ReferralDepositReward) return { processed: 0, paid: 0, capped: 0 };

  const due = await db.ReferralDepositReward.findAll({
    where: {
      status: REWARD_STATUS.SCHEDULED,
      payoutAt: { [Op.lte]: new Date() }
    },
    order: [['payout_at', 'ASC']],
    limit: Math.max(1, Math.min(500, parseInt(limit, 10) || 100))
  });

  let paid = 0;
  let capped = 0;
  for (const row of due) {
    await db.sequelize.transaction(async (t) => {
      const locked = await db.ReferralDepositReward.findByPk(row.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const result = await creditGiveGetReferralReward(locked, t);
      if (result === 'paid') paid += 1;
      if (result === 'capped') capped += 1;
    });
  }

  return { processed: due.length, paid, capped };
}

async function creditDueGiveGetReferralRewardsForReferrer(referrerUserId) {
  if (!db.ReferralDepositReward || !referrerUserId) return { paid: 0, capped: 0 };

  const due = await db.ReferralDepositReward.findAll({
    where: {
      referrerUserId,
      status: REWARD_STATUS.SCHEDULED,
      payoutAt: { [Op.lte]: new Date() }
    },
    limit: 20
  });

  let paid = 0;
  let capped = 0;
  for (const row of due) {
    await db.sequelize.transaction(async (t) => {
      const locked = await db.ReferralDepositReward.findByPk(row.id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const result = await creditGiveGetReferralReward(locked, t);
      if (result === 'paid') paid += 1;
      if (result === 'capped') capped += 1;
    });
  }

  return { paid, capped };
}

module.exports = {
  getWeeklyReferralEarnedSc,
  getWeeklyReferralRemainingSc,
  creditGiveGetReferralReward,
  creditDueGiveGetReferralRewards,
  creditDueGiveGetReferralRewardsForReferrer,
  weekAgoDate
};
