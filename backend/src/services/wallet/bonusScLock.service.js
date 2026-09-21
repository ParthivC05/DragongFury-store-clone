'use strict';

/**
 * Bonus SC (welcome / refer / daily / spin wheel) stays locked until the user
 * verifies their mobile number when the store has phone OTP enabled.
 *
 * Already phone-verified → not locked.
 * Store does not require phone OTP → not locked.
 * Old and new users are treated the same — a prior deposit does not unlock BSC.
 */

const db = require('../../db/models');
const { isAdminPanelAccount } = require('../../constants/roles');
const { isPhoneVerificationRequiredForStore } = require('../phone/phoneSettings.service');

const PHONE_VERIFY_REQUIRED_CODE = 'PHONE_VERIFY_REQUIRED';
const PHONE_VERIFY_REQUIRED_MESSAGE =
  'Verify your mobile number to unlock bonus SC.';

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function optionalHasDeposit(options = {}) {
  return options.hasDeposit === undefined ? null : Boolean(options.hasDeposit);
}

/**
 * Whether this user's bonus SC should stay locked until phone OTP.
 * Does not look at BSC amount — callers apply that.
 */
async function getBonusScLockState(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) {
    return {
      lockEligible: false,
      phoneVerified: false,
      phoneRequired: false,
      hasDeposit: false
    };
  }

  const user = await db.User.findByPk(uid, {
    attributes: ['userId', 'storeCode', 'isPhoneVerified', 'role', 'isAdmin'],
    transaction: options.transaction
  });
  if (!user || isAdminPanelAccount(user.role, user.isAdmin)) {
    return {
      lockEligible: false,
      phoneVerified: true,
      phoneRequired: false,
      hasDeposit: true
    };
  }

  const phoneVerified = Boolean(user.isPhoneVerified);
  if (phoneVerified) {
    return {
      lockEligible: false,
      phoneVerified: true,
      phoneRequired: true,
      hasDeposit: optionalHasDeposit(options)
    };
  }

  const phoneRequired = await isPhoneVerificationRequiredForStore(user.storeCode);
  if (!phoneRequired) {
    return {
      lockEligible: false,
      phoneVerified: false,
      phoneRequired: false,
      hasDeposit: optionalHasDeposit(options)
    };
  }

  return {
    lockEligible: true,
    phoneVerified: false,
    phoneRequired: true,
    hasDeposit: optionalHasDeposit(options)
  };
}

/**
 * Split usable BSC into locked vs spendable.
 */
async function resolveLockedBonusSc(userId, bscUsable, options = {}) {
  const usable = roundMoney(Math.max(0, Number(bscUsable) || 0));
  if (usable <= 0) {
    return {
      lockEligible: false,
      locked: false,
      lockedAmount: 0,
      spendableBsc: 0,
      phoneVerified: false,
      phoneRequired: false,
      hasDeposit: false
    };
  }

  const state = await getBonusScLockState(userId, options);
  if (!state.lockEligible) {
    return {
      ...state,
      locked: false,
      lockedAmount: 0,
      spendableBsc: usable
    };
  }

  return {
    ...state,
    locked: true,
    lockedAmount: usable,
    spendableBsc: 0
  };
}

module.exports = {
  PHONE_VERIFY_REQUIRED_CODE,
  PHONE_VERIFY_REQUIRED_MESSAGE,
  getBonusScLockState,
  resolveLockedBonusSc
};
