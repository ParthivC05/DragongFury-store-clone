'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const {
  REWARD_STATUS
} = require('./giveGetReferral.constants');
const { creditGiveGetReferralReward } = require('./creditGiveGetReferralReward.service');

const log = createLogger('referralPlaythrough');

/**
 * True when referred user has topped up to a game at least once after the deposit cleared
 * ("plays through it once").
 */
async function hasSatisfiedPlaythrough(referredUserId, _depositAmount, depositClearedAt, transaction) {
  if (!db.GameActivity) return false;
  const since = depositClearedAt ? new Date(depositClearedAt) : new Date(0);

  const anyTopup = await db.GameActivity.findOne({
    where: {
      userId: referredUserId,
      activityType: 'topup',
      createdAt: { [Op.gte]: since },
      amount: { [Op.gt]: 0 }
    },
    attributes: ['id'],
    transaction
  });
  return !!anyTopup;
}

/**
 * After a game topup (or on deposit), mark awaiting_playthrough rewards as scheduled
 * and credit immediately if the 24h payout window has already passed.
 */
async function markReferralPlaythroughForUser(referredUserId, options = {}) {
  if (!db.ReferralDepositReward || !referredUserId) return { updated: 0 };

  const user = await db.User.findByPk(referredUserId, {
    attributes: ['userId', 'storeCode', 'userReferredBy']
  });
  if (!user?.userReferredBy) {
    return { updated: 0 };
  }

  const { getEffectiveSettingsForStoreCode } = require('./getAffiliateSettings.service');
  const affiliateSettings = user.storeCode
    ? await getEffectiveSettingsForStoreCode(user.storeCode)
    : null;
  if (!affiliateSettings?.isGiveGet) {
    return { updated: 0 };
  }

  const pending = await db.ReferralDepositReward.findAll({
    where: {
      referredUserId,
      status: REWARD_STATUS.AWAITING_PLAYTHROUGH
    }
  });
  if (!pending.length) return { updated: 0 };

  let updated = 0;
  for (const reward of pending) {
    try {
      await db.sequelize.transaction(async (t) => {
        const locked = await db.ReferralDepositReward.findByPk(reward.id, {
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (!locked || locked.status !== REWARD_STATUS.AWAITING_PLAYTHROUGH) return;

        let depositAmount = Number(locked.amount) || 0;
        let depositClearedAt = locked.createdAt;
        if (locked.depositRequestId && db.DepositRequest) {
          const dep = await db.DepositRequest.findByPk(locked.depositRequestId, {
            attributes: ['id', 'amount', 'updated_at', 'created_at'],
            transaction: t
          });
          if (dep) {
            depositAmount = Number(dep.amount) || depositAmount;
            depositClearedAt = dep.updated_at || dep.created_at || depositClearedAt;
          }
        }

        const ok = await hasSatisfiedPlaythrough(
          referredUserId,
          depositAmount,
          depositClearedAt,
          t
        );
        if (!ok) return;

        const now = new Date();
        await locked.update(
          {
            status: REWARD_STATUS.SCHEDULED,
            playthroughAt: now
          },
          { transaction: t }
        );
        updated += 1;

        // If 24h already elapsed, credit in the same transaction.
        await creditGiveGetReferralReward(locked, t);
      });
    } catch (err) {
      log.warn('markReferralPlaythrough failed', {
        rewardId: reward.id,
        referredUserId,
        message: err.message
      });
    }
  }

  if (options.afterTopup && updated > 0) {
    log.info('Referral playthrough satisfied', { referredUserId, updated });
  }
  return { updated };
}

async function tryMarkReferralPlaythroughForUser(referredUserId) {
  try {
    return await markReferralPlaythroughForUser(referredUserId, { afterTopup: true });
  } catch (err) {
    log.warn('tryMarkReferralPlaythrough failed', { referredUserId, message: err.message });
    return { updated: 0 };
  }
}

module.exports = {
  hasSatisfiedPlaythrough,
  markReferralPlaythroughForUser,
  tryMarkReferralPlaythroughForUser
};
