const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { getSpinWheelSettingsForUser } = require('./getSpinWheelSettings.service');

const log = createLogger('spinWheel');
const {
  SPIN_COOLDOWN_MS,
  MAX_SPINS_PER_24H,
  parseUserTransactionCreatedAt,
  getSpinWheelDepositEligibility,
  getSpinWheelStatus,
  countRecentSpins
} = require('./getSpinWheelStatus.service');
const { probabilityRandomIndex } = require('./weightedRandom.service');
const { getBalance } = require('../wallet/getBalance.service');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');

const { issueSpinWheelCoupon } = require('./spinWheelCoupon.service');

function logSpinResult(userId, outcome, balanceSc, pendingFreeSpins, useFreeSpin) {
  const typeLabel =
    outcome.type === 'sc_coins'
      ? 'SC COINS'
      : outcome.type === 'free_spin'
        ? 'FREE SPIN'
        : outcome.type === 'coupon'
          ? 'COUPON'
          : 'NO WIN';
  log.info('Spin wheel result', {
    userId,
    type: typeLabel,
    label: outcome.label,
    value: outcome.value,
    balance_sc: balanceSc ?? undefined,
    pending_free_spins: pendingFreeSpins,
    used_free_spin: useFreeSpin || undefined
  });
}

async function performSpin(userId) {
  const { segments, probabilityOverrides } = await getSpinWheelSettingsForUser(userId);
  if (!segments || segments.length === 0) {
    const err = new Error('Spin wheel is not configured.');
    err.statusCode = 503;
    throw err;
  }

  const currencyCode = BONUS_CURRENCY_CODE;

  let result;
  await db.sequelize.transaction(async (t) => {
    // Lock user row so only one spin can run at a time per user (prevents double bonus on rapid clicks)
    const user = await db.User.findByPk(userId, {
      attributes: ['userId', 'pendingFreeSpins', 'createdAt'],
      lock: t.LOCK.UPDATE,
      transaction: t
    });
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    const pendingFreeSpins = Math.max(0, parseInt(user.pendingFreeSpins, 10) || 0);
    const eligibility = await getSpinWheelDepositEligibility(userId, {
      user,
      transaction: t,
      now: new Date()
    });
    if (eligibility.spinLocked) {
      const err = new Error('Spin wheel is locked. Make a deposit to unlock daily spins.');
      err.statusCode = 403;
      throw err;
    }

    // Hard daily cap: total spins (daily + free-spin chained) within a rolling 24h window.
    const spinsInWindow = await countRecentSpins(userId, { transaction: t, now: new Date() });
    if (spinsInWindow >= MAX_SPINS_PER_24H) {
      const err = new Error('Daily spin limit reached. Come back tomorrow.');
      err.statusCode = 429;
      throw err;
    }

    const lastSpin = await db.UserTransaction.findOne({
      where: { userId, type: 'spin_wheel' },
      order: [['createdAt', 'DESC']],
      attributes: ['createdAt'],
      transaction: t
    });

    const now = new Date();
    let canSpin = false;
    if (!lastSpin) {
      canSpin = true;
    } else {
      const lastCreated = parseUserTransactionCreatedAt(lastSpin);
      if (!lastCreated) {
        canSpin = true;
      } else {
        const nextAt = new Date(lastCreated.getTime() + SPIN_COOLDOWN_MS);
        canSpin = now >= nextAt || pendingFreeSpins > 0;
      }
    }
    if (!canSpin) {
      const err = new Error('No spin available. Come back tomorrow or use a free spin.');
      err.statusCode = 400;
      throw err;
    }

    const lastCreatedForFree = lastSpin ? parseUserTransactionCreatedAt(lastSpin) : null;
    const useFreeSpin = !!(
      lastCreatedForFree &&
      now.getTime() - lastCreatedForFree.getTime() < SPIN_COOLDOWN_MS &&
      pendingFreeSpins > 0
    );

    let segmentProbabilitiesByIndex = null;
    if (Array.isArray(probabilityOverrides) && probabilityOverrides.length > 0 && pendingFreeSpins >= 10) {
      const override = probabilityOverrides
        .filter((o) => pendingFreeSpins >= (o.whenFreeSpinsAtLeast || 0))
        .sort((a, b) => (b.whenFreeSpinsAtLeast || 0) - (a.whenFreeSpinsAtLeast || 0))[0];
      if (override && override.segmentProbabilities) segmentProbabilitiesByIndex = override.segmentProbabilities;
    }

    const index = probabilityRandomIndex(segments, segmentProbabilitiesByIndex);
    const segment = segments[index];

    let newPendingFreeSpins = pendingFreeSpins - (useFreeSpin ? 1 : 0);

    if (segment.type === 'sc_coins' && segment.value > 0) {
      await creditBonusSc(userId, segment.value, {
        transaction: t,
        ledger: {
          eventType: 'SPIN_BONUS',
          bonusType: 'SPIN_BONUS',
          sourceType: 'SPIN_WHEEL',
          sourceId: userId,
          remarks: `Spin wheel: ${segment.label}`
        }
      });
    }
    if (segment.type === 'free_spin' && segment.value > 0) {
      newPendingFreeSpins += segment.value;
    }

    let issuedCoupon = null;
    if (segment.type === 'coupon' && segment.value > 0) {
      issuedCoupon = await issueSpinWheelCoupon({
        userId,
        discountPercent: segment.value,
        transaction: t
      });
      if (!issuedCoupon) {
        const err = new Error('Could not issue coupon code. Please try again.');
        err.statusCode = 500;
        throw err;
      }
    }

    await user.update({ pendingFreeSpins: newPendingFreeSpins }, { transaction: t });
    const spinTx = await db.UserTransaction.create(
      {
        userId,
        type: 'spin_wheel',
        amount: segment.type === 'sc_coins' ? segment.value : 0,
        currencyCode,
        description: `Spin wheel: ${segment.label}`,
        metadata: {
          segmentIndex: index,
          segmentType: segment.type,
          segmentValue: segment.value,
          segmentLabel: segment.label,
          usedFreeSpin: useFreeSpin,
          ...(issuedCoupon
            ? {
                couponId: issuedCoupon.id,
                couponCode: issuedCoupon.code,
                couponPercent: Number(issuedCoupon.discountPercent)
              }
            : {})
        }
      },
      { transaction: t }
    );

    if (issuedCoupon && spinTx?.id) {
      await issuedCoupon.update({ spinTransactionId: spinTx.id }, { transaction: t });
    }

    result = { segment, index, useFreeSpin, newPendingFreeSpins, issuedCoupon };
  });

  const { segment, index, useFreeSpin, newPendingFreeSpins, issuedCoupon } = result;
  const [balanceInfo, spinStatus] = await Promise.all([
    getBalance(userId),
    getSpinWheelStatus(userId).catch(() => null)
  ]);
  const outcomeValue =
    segment.type === 'sc_coins'
      ? Math.max(0, Number(segment.value) || 0)
      : segment.type === 'free_spin'
        ? Math.max(1, parseInt(segment.value, 10) || 1)
        : segment.type === 'coupon'
          ? Math.max(1, Number(segment.value) || 0)
          : 0;

  const outcome = {
    segmentIndex: index,
    type: segment.type,
    value: outcomeValue,
    label: segment.label,
    ...(issuedCoupon
      ? {
          coupon_code: issuedCoupon.code,
          coupon_percent: Number(issuedCoupon.discountPercent)
        }
      : {})
  };

  const payload = {
    outcome,
    balance_sc: balanceInfo.usable_balance_sc != null ? balanceInfo.usable_balance_sc : balanceInfo.balance_sc,
    pending_free_spins: newPendingFreeSpins,
    can_spin: spinStatus ? spinStatus.can_spin === true : newPendingFreeSpins > 0,
    daily_limit_reached: spinStatus ? spinStatus.daily_limit_reached === true : false,
    next_spin_at: spinStatus?.next_spin_at || null,
    max_spins_per_day: spinStatus?.max_spins_per_day ?? MAX_SPINS_PER_24H,
    spins_used_today: spinStatus?.spins_used_today ?? null,
    usable_coupons: Array.isArray(spinStatus?.usable_coupons) ? spinStatus.usable_coupons : []
  };

  logSpinResult(userId, outcome, balanceInfo.balance_sc, newPendingFreeSpins, useFreeSpin);

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return { payload: encoded };
}

module.exports = { performSpin };
