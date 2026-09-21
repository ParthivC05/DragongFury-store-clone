'use strict';

const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { probabilityRandomIndex } = require('../spinWheel/weightedRandom.service');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');
const { getBalance } = require('../wallet/getBalance.service');
const { getEffectiveSettings } = require('./dailyBonusSettings.service');
const { loadUser, featureAvailableForUser } = require('./getDailyBonusStatus.service');
const { DAILY_BONUS_SPIN_TX_TYPE, roundMoney } = require('./dailyBonus.constants');

const log = createLogger('dailyBonusSpin');

async function performDailyBonusSpin(userId) {
  const currencyCode = BONUS_CURRENCY_CODE;

  const result = await db.sequelize.transaction(async (t) => {
    const user = await loadUser(userId, t);
    const settings = await getEffectiveSettings(user.distributorCode, user.storeCode);
    if (!featureAvailableForUser(user, settings)) {
      const err = new Error('Daily bonus spin is not available for your account.');
      err.statusCode = 403;
      throw err;
    }

    const pending = Math.max(0, parseInt(user.pendingDailyBonusSpins, 10) || 0);
    if (pending < 1) {
      const err = new Error('No bonus spins available. Claim a daily bonus spin reward first.');
      err.statusCode = 400;
      throw err;
    }

    const segments = settings.spinSegments || [];
    if (segments.length < 2) {
      const err = new Error('Bonus spin wheel is not configured.');
      err.statusCode = 503;
      throw err;
    }

    const index = probabilityRandomIndex(segments);
    const outcome = segments[index];
    const nextPending = pending - 1;
    await user.update({ pendingDailyBonusSpins: nextPending }, { transaction: t });

    let amountSc = 0;
    if (outcome.type === 'sc_coins') {
      amountSc = roundMoney(outcome.value);
      await db.UserTransaction.create(
        {
          userId,
          type: DAILY_BONUS_SPIN_TX_TYPE,
          amount: amountSc,
          currencyCode,
          description: `Daily bonus spin: ${amountSc} BSC`,
          metadata: {
            source: 'daily_bonus_spin',
            segmentId: outcome.id,
            label: outcome.label,
            type: outcome.type,
            value: outcome.value
          }
        },
        { transaction: t }
      );

      await creditBonusSc(userId, amountSc, {
        transaction: t,
        ledger: {
          eventType: 'SPIN_BONUS',
          bonusType: 'SPIN_BONUS',
          sourceType: 'DAILY_BONUS_SPIN',
          sourceId: outcome.id,
          remarks: `Daily bonus spin: ${outcome.label}`
        }
      });
    } else {
      await db.UserTransaction.create(
        {
          userId,
          type: DAILY_BONUS_SPIN_TX_TYPE,
          amount: 0,
          currencyCode,
          description: 'Daily bonus spin: no win',
          metadata: {
            source: 'daily_bonus_spin',
            segmentId: outcome.id,
            label: outcome.label,
            type: outcome.type,
            value: 0
          }
        },
        { transaction: t }
      );
    }

    log.info('Daily bonus spin result', {
      userId,
      type: outcome.type,
      value: outcome.value,
      pending_daily_bonus_spins: nextPending
    });

    return {
      outcome: {
        id: outcome.id,
        type: outcome.type,
        value: outcome.type === 'sc_coins' ? amountSc : 0,
        label: outcome.label,
        color: outcome.color,
        index
      },
      pending_daily_bonus_spins: nextPending
    };
  });

  const balance = await getBalance(userId).catch(() => null);
  return {
    ...result,
    balance_sc: balance?.balance_sc ?? null
  };
}

module.exports = { performDailyBonusSpin };
