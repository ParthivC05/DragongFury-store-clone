const db = require('../../db/models');
const { Op } = require('sequelize');
const { createLogger } = require('../../libs/logger');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');
const {
  GUEST_LANDING_SPIN_WIN_SC,
  GUEST_LANDING_SPIN_CLAIM_MAX_AGE_MS
} = require('./guestLandingSpin.constants');

const log = createLogger('spinWheel');

function parseGuestSpinClaimInput(wonAt, amountSc) {
  const amount = Number(amountSc);
  const won = Number(wonAt);
  if (!Number.isFinite(amount) || amount !== GUEST_LANDING_SPIN_WIN_SC) return null;
  if (!Number.isFinite(won) || won <= 0) return null;

  const now = Date.now();
  if (won > now + 60 * 1000) return null;
  if (now - won > GUEST_LANDING_SPIN_CLAIM_MAX_AGE_MS) return null;

  return { amountSc: amount, wonAt: won };
}

async function hasAlreadyClaimedGuestLandingSpin(userId, transaction) {
  const existing = await db.UserTransaction.findOne({
    where: {
      userId,
      type: 'spin_wheel',
      [Op.and]: [
        db.sequelize.literal("metadata->>'source' = 'guest_landing_spin'")
      ]
    },
    attributes: ['id'],
    transaction
  });
  return !!existing;
}

/**
 * Credit a guest landing spin win after signup and record a spin_wheel transaction
 * so the authenticated wheel respects the 24-hour cooldown.
 */
async function claimGuestLandingSpin(userId, { wonAt, amountSc }, transaction = null) {
  const parsed = parseGuestSpinClaimInput(wonAt, amountSc);
  if (!parsed) return null;

  const run = async (t) => {
    if (await hasAlreadyClaimedGuestLandingSpin(userId, t)) {
      return null;
    }

    const currencyCode = BONUS_CURRENCY_CODE;
    const credit = parsed.amountSc;
    await creditBonusSc(userId, credit, {
      transaction: t,
      ledger: {
        eventType: 'SPIN_BONUS',
        bonusType: 'SPIN_BONUS',
        sourceType: 'GUEST_LANDING_SPIN',
        sourceId: userId,
        remarks: 'Guest landing spin'
      }
    });

    await db.UserTransaction.create(
      {
        userId,
        type: 'spin_wheel',
        amount: credit,
        currencyCode,
        description: `Guest landing spin: ${credit} BSC`,
        metadata: {
          source: 'guest_landing_spin',
          segmentType: 'sc_coins',
          segmentValue: credit,
          segmentLabel: `${credit} BSC`,
          guestSpinWonAt: parsed.wonAt
        }
      },
      { transaction: t }
    );

    log.info('Guest landing spin claimed', { userId, amountSc: credit, wonAt: parsed.wonAt });
    return { claimed: true, amount_sc: credit };
  };

  if (transaction) return run(transaction);
  return db.sequelize.transaction(run);
}

function hasGuestSpinClaimPayload(body) {
  if (!body) return false;
  const wonAt = body.guestSpinWonAt ?? body.guest_spin_won_at;
  const amountSc = body.guestSpinAmountSc ?? body.guest_spin_amount_sc;
  return wonAt != null || amountSc != null;
}

function claimGuestLandingSpinFromBody(userId, body, transaction = null) {
  if (!hasGuestSpinClaimPayload(body)) return null;
  const wonAt = body.guestSpinWonAt ?? body.guest_spin_won_at;
  const amountSc = body.guestSpinAmountSc ?? body.guest_spin_amount_sc;
  return claimGuestLandingSpin(userId, { wonAt, amountSc }, transaction);
}

async function tryClaimGuestLandingSpinFromBody(userId, body, transaction = null) {
  if (!hasGuestSpinClaimPayload(body)) return null;
  try {
    return await claimGuestLandingSpinFromBody(userId, body, transaction);
  } catch (err) {
    log.warn('Guest landing spin claim failed', { userId, message: err.message });
    return null;
  }
}

module.exports = {
  claimGuestLandingSpin,
  claimGuestLandingSpinFromBody,
  tryClaimGuestLandingSpinFromBody,
  hasGuestSpinClaimPayload,
  parseGuestSpinClaimInput,
  GUEST_LANDING_SPIN_WIN_SC
};
