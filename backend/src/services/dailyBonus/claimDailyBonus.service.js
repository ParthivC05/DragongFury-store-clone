'use strict';

const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');
const { getBalance } = require('../wallet/getBalance.service');
const { getEffectiveSettings } = require('./dailyBonusSettings.service');
const {
  getOrCreateCampaign,
  loadUser,
  featureAvailableForUser
} = require('./getDailyBonusStatus.service');
const {
  CAMPAIGN_DAYS,
  DAILY_BONUS_TX_TYPE,
  calendarDateUTC,
  roundMoney,
  isUniqueViolation
} = require('./dailyBonus.constants');

const log = createLogger('dailyBonusClaim');

async function claimDailyBonus(userId, dayIndexRaw) {
  const dayIndex = parseInt(dayIndexRaw, 10);
  if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > CAMPAIGN_DAYS) {
    const err = new Error(`dayIndex must be between 1 and ${CAMPAIGN_DAYS}.`);
    err.statusCode = 400;
    throw err;
  }

  const currencyCode = BONUS_CURRENCY_CODE;
  const today = calendarDateUTC();

  const result = await db.sequelize.transaction(async (t) => {
    const user = await loadUser(userId, t);
    const settings = await getEffectiveSettings(user.distributorCode, user.storeCode);
    if (!featureAvailableForUser(user, settings)) {
      const err = new Error('Daily bonus is not available for your account.');
      err.statusCode = 403;
      throw err;
    }

    const dayConfig = (settings.days || []).find((d) => d.dayIndex === dayIndex);
    if (!dayConfig) {
      const err = new Error('Day configuration not found.');
      err.statusCode = 400;
      throw err;
    }

    const campaign = await getOrCreateCampaign(
      user,
      {
        startIfMissing: true,
        today,
        loopEnabled: settings.repeatAfterComplete === true
      },
      t
    );
    if (!campaign || campaign.status !== 'active') {
      const err = new Error(
        campaign?.status === 'completed'
          ? settings.repeatAfterComplete
            ? 'You already finished this 7-day cycle. Come back tomorrow to start Day 1 again.'
            : 'You have already completed the daily bonus campaign.'
          : 'Daily bonus is not available.'
      );
      err.statusCode = 400;
      throw err;
    }

    // Must claim in order: Day N only after Day N-1 is claimed in this cycle.
    if (dayIndex > 1) {
      const previousClaim = await db.UserDailyBonusClaim.findOne({
        where: { campaignId: campaign.id, userId, dayIndex: dayIndex - 1 },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!previousClaim) {
        const err = new Error(`Claim Day ${dayIndex - 1} before unlocking Day ${dayIndex}.`);
        err.statusCode = 400;
        throw err;
      }
    }

    const alreadyClaimedDay = await db.UserDailyBonusClaim.findOne({
      where: { campaignId: campaign.id, userId, dayIndex },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (alreadyClaimedDay) {
      const err = new Error('This day has already been claimed.');
      err.statusCode = 400;
      throw err;
    }

    const claimedToday = await db.UserDailyBonusClaim.findOne({
      where: { userId, claimedOn: today },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (claimedToday) {
      const err = new Error('You already claimed a daily bonus today. Come back tomorrow.');
      err.statusCode = 400;
      throw err;
    }

    const rewardType = dayConfig.rewardType;
    const rewardPayload = {
      dayIndex,
      rewardType,
      amountSc: dayConfig.amountSc,
      spinCount: dayConfig.spinCount,
      percentOff: dayConfig.percentOff,
      packageScope: dayConfig.packageScope,
      packageIds: dayConfig.packageIds || []
    };

    let claim;
    try {
      claim = await db.UserDailyBonusClaim.create(
        {
          campaignId: campaign.id,
          userId,
          dayIndex,
          rewardType,
          rewardPayload,
          claimedOn: today
        },
        { transaction: t }
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const conflict = new Error('This daily bonus claim is no longer available.');
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }

    let granted = { type: rewardType };
    let amountScCredited = 0;
    let pendingFreeSpins = Math.max(0, parseInt(user.pendingFreeSpins, 10) || 0);

    if (rewardType === 'sc_coins') {
      const credit = roundMoney(dayConfig.amountSc);
      await db.UserTransaction.create(
        {
          userId,
          type: DAILY_BONUS_TX_TYPE,
          amount: credit,
          currencyCode,
          description: `Daily bonus day ${dayIndex}: ${credit} BSC`,
          metadata: {
            source: 'daily_bonus',
            dayIndex,
            claimId: claim.id,
            campaignId: campaign.id,
            bonusSc: credit
          }
        },
        { transaction: t }
      );

      await creditBonusSc(userId, credit, {
        transaction: t,
        ledger: {
          eventType: 'DAILY_BONUS',
          bonusType: 'DAILY_BONUS',
          sourceType: 'DAILY_BONUS',
          sourceId: claim.id,
          remarks: `Daily bonus day ${dayIndex}`
        }
      });
      amountScCredited = credit;
      granted = { type: rewardType, amount_sc: credit };
    } else if (rewardType === 'bonus_spin') {
      // Grant extra spins on the normal Daily Spin wheel (pending_free_spins).
      const spins = dayConfig.spinCount;
      const current = Math.max(0, parseInt(user.pendingFreeSpins, 10) || 0);
      pendingFreeSpins = current + spins;
      await user.update({ pendingFreeSpins }, { transaction: t });
      granted = {
        type: rewardType,
        spin_count: spins,
        pending_free_spins: pendingFreeSpins
      };
    } else if (rewardType === 'discount_voucher') {
      const voucher = await db.UserDailyBonusVoucher.create(
        {
          userId,
          campaignId: campaign.id,
          claimId: claim.id,
          percentOff: dayConfig.percentOff,
          packageScope: dayConfig.packageScope,
          packageIds: dayConfig.packageScope === 'selected' ? dayConfig.packageIds : null,
          status: 'available'
        },
        { transaction: t }
      );
      granted = {
        type: rewardType,
        voucher_id: voucher.id,
        percent_off: Number(dayConfig.percentOff),
        package_scope: dayConfig.packageScope,
        package_ids: dayConfig.packageIds || []
      };
    }

    const claimsCount = await db.UserDailyBonusClaim.count({
      where: { campaignId: campaign.id },
      transaction: t
    });
    if (claimsCount >= CAMPAIGN_DAYS) {
      await campaign.update(
        { status: 'completed', completedAt: new Date(), updatedAt: new Date() },
        { transaction: t }
      );
    }

    log.info('Daily bonus claimed', {
      userId,
      dayIndex,
      rewardType,
      claimId: claim.id,
      campaignId: campaign.id
    });

    return {
      day_index: dayIndex,
      claimed_on: today,
      reward: granted,
      amount_sc_credited: amountScCredited,
      pending_free_spins: pendingFreeSpins,
      campaign_status: claimsCount >= CAMPAIGN_DAYS ? 'completed' : campaign.status,
      claims_count: claimsCount
    };
  });

  const balance = await getBalance(userId, { skipCache: true }).catch(() => null);
  return {
    ...result,
    balance_sc: balance?.wallet_balance_sc ?? balance?.balance_sc ?? null
  };
}

module.exports = { claimDailyBonus };
