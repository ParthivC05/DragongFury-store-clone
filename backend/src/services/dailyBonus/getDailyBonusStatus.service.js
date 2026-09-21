'use strict';

const db = require('../../db/models');
const { normalizeStoreCode } = require('../auth/storeBinding.helpers');
const { getEffectiveSettings } = require('./dailyBonusSettings.service');
const {
  expireStaleDailyBonusVouchers,
  serializeVoucher
} = require('./applyDailyBonusVoucher.service');
const {
  CAMPAIGN_DAYS,
  calendarDateUTC,
  addCalendarDays,
  isUniqueViolation,
  isVoucherPastTtl,
  toDateOnly,
  isDateOnlyBefore
} = require('./dailyBonus.constants');

function featureAvailableForUser(user, settings) {
  const storeCode = normalizeStoreCode(user?.storeCode || '');
  if (!storeCode) return false;
  if (!settings?.enabled) return false;
  return true;
}

async function loadUser(userId, transaction) {
  const user = await db.User.findByPk(userId, {
    attributes: [
      'userId',
      'storeCode',
      'distributorCode',
      'pendingFreeSpins',
      'pendingDailyBonusSpins',
      'role',
      'isAdmin'
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return user;
}

async function findCurrentCampaign(userId, transaction) {
  const lock = transaction ? transaction.LOCK.UPDATE : undefined;
  const active = await db.UserDailyBonusCampaign.findOne({
    where: { userId, status: 'active' },
    transaction,
    lock
  });
  if (active) return active;
  return db.UserDailyBonusCampaign.findOne({
    where: { userId },
    order: [['id', 'DESC']],
    transaction,
    lock
  });
}

async function createCampaign(user, today, transaction) {
  const startedOn = today;
  // Placeholder only — claim eligibility does not use ends_on.
  const endsOn = addCalendarDays(startedOn, CAMPAIGN_DAYS - 1);
  try {
    return await db.UserDailyBonusCampaign.create(
      {
        userId: user.userId,
        storeCode: normalizeStoreCode(user.storeCode),
        distributorCode: user.distributorCode || null,
        startedOn,
        endsOn,
        status: 'active'
      },
      { transaction }
    );
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return findCurrentCampaign(user.userId, transaction);
  }
}

async function lastClaimDateForCampaign(campaign, userId, transaction) {
  const lastClaim = await db.UserDailyBonusClaim.findOne({
    where: { campaignId: campaign.id, userId },
    order: [
      ['claimedOn', 'DESC'],
      ['id', 'DESC']
    ],
    transaction
  });
  return (
    toDateOnly(lastClaim?.claimedOn) ||
    calendarDateUTC(campaign.completedAt) ||
    toDateOnly(campaign.endsOn)
  );
}

/**
 * Campaigns do not time-expire mid-cycle. Legacy "expired" rows are reopened
 * until all 7 days are claimed. If the store enables repeatAfterComplete,
 * a new Day 1–7 cycle starts on the next UTC day after the previous cycle
 * is fully claimed.
 */
async function getOrCreateCampaign(
  user,
  { startIfMissing = false, today = calendarDateUTC(), loopEnabled = false } = {},
  transaction
) {
  let campaign = await findCurrentCampaign(user.userId, transaction);

  if (campaign) {
    if (campaign.status === 'expired') {
      await campaign.update({ status: 'active', updatedAt: new Date() }, { transaction });
      campaign.status = 'active';
    }

    if (loopEnabled && startIfMissing && campaign.status === 'completed') {
      const lastOn = await lastClaimDateForCampaign(campaign, user.userId, transaction);
      if (isDateOnlyBefore(lastOn, today)) {
        campaign = await createCampaign(user, today, transaction);
      }
    }
    return campaign;
  }

  if (!startIfMissing) return null;
  return createCampaign(user, today, transaction);
}

function buildDayStatus({ dayConfig, campaign, claimsByDay, claimedToday }) {
  const dayIndex = dayConfig.dayIndex;
  const claim = claimsByDay.get(dayIndex) || null;
  const previousClaimed = dayIndex === 1 || claimsByDay.has(dayIndex - 1);
  const unlocked =
    (!campaign && dayIndex === 1) ||
    (campaign && campaign.status === 'active' && previousClaimed);

  let state = 'locked';
  if (claim) {
    state = 'claimed';
  } else if (campaign && campaign.status === 'completed') {
    state = 'locked';
  } else if (!unlocked) {
    state = 'locked';
  } else if (claimedToday) {
    state = 'waiting_tomorrow';
  } else {
    state = campaign || dayIndex === 1 ? 'claimable' : 'available';
  }

  return {
    dayIndex,
    label: dayConfig.label,
    rewardType: dayConfig.rewardType,
    amountSc: dayConfig.amountSc,
    spinCount: dayConfig.spinCount,
    percentOff: dayConfig.percentOff,
    packageScope: dayConfig.packageScope,
    packageIds: dayConfig.packageIds || [],
    state,
    claimedOn: claim?.claimedOn || null,
    unlocked: !!unlocked
  };
}

function emptyStatus(user, extra = {}) {
  return {
    available: false,
    enabled: false,
    reason: 'disabled',
    today: calendarDateUTC(),
    campaign: null,
    days: [],
    pending_daily_bonus_spins: Math.max(0, parseInt(user.pendingDailyBonusSpins, 10) || 0),
    pending_free_spins: Math.max(0, parseInt(user.pendingFreeSpins, 10) || 0),
    vouchers: [],
    spin_segments: [],
    repeat_after_complete: false,
    ...extra
  };
}

/**
 * Start campaign on first open (idempotent). Returns full status payload.
 */
async function getDailyBonusStatus(userId, { start = true } = {}) {
  const user = await loadUser(userId);
  const settings = await getEffectiveSettings(user.distributorCode, user.storeCode);
  const available = featureAvailableForUser(user, settings);
  const today = calendarDateUTC();
  const loopEnabled = settings.repeatAfterComplete === true;

  if (!available) {
    return emptyStatus(user);
  }

  const run = async (t) => {
    const lockedUser = await loadUser(userId, t);
    let campaign = await getOrCreateCampaign(
      lockedUser,
      { startIfMissing: start, today, loopEnabled },
      t
    );

    const claims = campaign
      ? await db.UserDailyBonusClaim.findAll({
          where: { campaignId: campaign.id, userId },
          transaction: t
        })
      : [];
    const claimsByDay = new Map(claims.map((c) => [c.dayIndex, c]));
    const claimedTodayRow = await db.UserDailyBonusClaim.findOne({
      where: { userId, claimedOn: today },
      transaction: t
    });
    const claimedToday = !!claimedTodayRow;

    if (campaign && campaign.status === 'active') {
      const allClaimed = claims.length >= CAMPAIGN_DAYS;
      if (allClaimed) {
        await campaign.update(
          { status: 'completed', completedAt: new Date(), updatedAt: new Date() },
          { transaction: t }
        );
        campaign.status = 'completed';
      }
    }

    await expireStaleDailyBonusVouchers({ userId, transaction: t });

    const vouchers = await db.UserDailyBonusVoucher.findAll({
      where: { userId, status: 'available' },
      order: [['id', 'ASC']],
      transaction: t
    });

    const days = (settings.days || []).map((dayConfig) =>
      buildDayStatus({
        dayConfig,
        campaign,
        claimsByDay,
        claimedToday
      })
    );

    const cycleComplete = !!campaign && campaign.status === 'completed';

    return {
      available: true,
      enabled: true,
      today,
      permanently_done: cycleComplete,
      cycle_complete: cycleComplete,
      repeat_after_complete: loopEnabled,
      claimed_today: claimedToday,
      can_claim_today:
        !cycleComplete && !claimedToday && days.some((d) => d.state === 'claimable'),
      campaign: campaign
        ? {
            id: campaign.id,
            status: campaign.status,
            started_on: campaign.startedOn,
            claims_count: claims.length,
            next_day_index: cycleComplete ? null : Math.min(CAMPAIGN_DAYS, claims.length + 1)
          }
        : null,
      days,
      pending_daily_bonus_spins: Math.max(
        0,
        parseInt(lockedUser.pendingDailyBonusSpins, 10) || 0
      ),
      pending_free_spins: Math.max(0, parseInt(lockedUser.pendingFreeSpins, 10) || 0),
      vouchers: vouchers.filter((v) => !isVoucherPastTtl(v)).map(serializeVoucher),
      spin_segments: []
    };
  };

  if (start) {
    return db.sequelize.transaction(run);
  }
  return run(null);
}

module.exports = {
  getDailyBonusStatus,
  getOrCreateCampaign,
  loadUser,
  featureAvailableForUser,
  buildDayStatus
};
