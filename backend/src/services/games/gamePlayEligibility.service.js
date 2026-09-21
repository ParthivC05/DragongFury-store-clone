'use strict';

/**
 * Game-play eligibility gate.
 *
 * Policy: a first purchase (deposit) is only required for users who received a
 * signup activation bonus — either welcome signup or referral friend signup.
 * That bonus is granted at signup for eligible stores, so its presence marks a
 * "new" user who must deposit to activate the bonus before playing. Older users
 * (who signed up before the bonus existed) and users on stores that never grant
 * it have no such transaction and can play without depositing.
 */

const { Op } = require('sequelize');
const db = require('../../db/models');
const { WELCOME_SIGNUP_TX_TYPE } = require('../wallet/bonusPlaythrough.constants');
const { FRIEND_SIGNUP_TX_TYPE } = require('../affiliate/giveGetReferral.constants');
const {
  isRequireDepositToActivateBonusEnabled
} = require('../welcomeSignupBonus/welcomeSignupBonusSettings.service');
const {
  PHONE_VERIFY_REQUIRED_CODE,
  PHONE_VERIFY_REQUIRED_MESSAGE,
  resolveLockedBonusSc
} = require('../wallet/bonusScLock.service');
const { ensureWallet, usableOf } = require('../wallet/walletBuckets.service');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');

const ACTIVATION_BONUS_WELCOME = 'welcome';
const ACTIVATION_BONUS_REFERRAL = 'referral';

const DEPOSIT_REQUIRED_CODE = 'DEPOSIT_REQUIRED';
const DEPOSIT_REQUIRED_MESSAGE_WELCOME =
  'Make your first package purchase to activate your welcome bonus and unlock games.';
const DEPOSIT_REQUIRED_MESSAGE_REFERRAL =
  'Make your first package purchase to activate your refer bonus and unlock games.';

const DEPOSIT_TX_TYPES = ['deposit', 'deposit_courtesy'];

function messageForActivationBonus(activationBonusType) {
  return activationBonusType === ACTIVATION_BONUS_REFERRAL
    ? DEPOSIT_REQUIRED_MESSAGE_REFERRAL
    : DEPOSIT_REQUIRED_MESSAGE_WELCOME;
}

/**
 * True when the user has at least one completed wallet deposit.
 * Matches wallet playthrough checks and spin-wheel eligibility.
 */
async function hasUserCompletedDeposit(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return false;

  const depositTx = await db.UserTransaction.findOne({
    where: {
      userId: uid,
      type: { [Op.in]: DEPOSIT_TX_TYPES },
      amount: { [Op.gt]: 0 }
    },
    attributes: ['id'],
    transaction: options.transaction
  });
  if (depositTx) return true;

  const depositRequest = await db.DepositRequest.findOne({
    where: {
      userId: uid,
      status: 'completed',
      amount: { [Op.gt]: 0 }
    },
    attributes: ['id'],
    transaction: options.transaction
  });
  return !!depositRequest;
}

/**
 * True when the user received the welcome signup bonus.
 */
async function hasReceivedWelcomeSignupBonus(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return false;

  const bonusTx = await db.UserTransaction.findOne({
    where: { userId: uid, type: WELCOME_SIGNUP_TX_TYPE },
    attributes: ['id'],
    transaction: options.transaction
  });
  return !!bonusTx;
}

async function hasReceivedReferralFriendSignupBonus(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return false;

  const bonusTx = await db.UserTransaction.findOne({
    where: { userId: uid, type: FRIEND_SIGNUP_TX_TYPE },
    attributes: ['id'],
    transaction: options.transaction
  });
  return !!bonusTx;
}

/**
 * Which signup bonus must be activated via first deposit, if any.
 * Prefer referral when both exist (should not happen after referred-user skip).
 * @returns {Promise<'welcome'|'referral'|null>}
 */
async function getActivationBonusType(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return null;

  const rows = await db.UserTransaction.findAll({
    where: {
      userId: uid,
      type: { [Op.in]: [FRIEND_SIGNUP_TX_TYPE, WELCOME_SIGNUP_TX_TYPE] }
    },
    attributes: ['type'],
    transaction: options.transaction
  });
  const types = new Set(rows.map((row) => row.type));
  if (types.has(FRIEND_SIGNUP_TX_TYPE)) return ACTIVATION_BONUS_REFERRAL;
  if (types.has(WELCOME_SIGNUP_TX_TYPE)) return ACTIVATION_BONUS_WELCOME;
  return null;
}

async function isActivationDepositGateEnabledForUser(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return true;

  const user = await db.User.findByPk(uid, {
    attributes: ['distributorCode', 'storeCode'],
    transaction: options.transaction
  });
  if (!user?.storeCode) return true;

  return isRequireDepositToActivateBonusEnabled(user.distributorCode, user.storeCode);
}

/**
 * Deposit is required for users who received welcome or referral friend signup bonus,
 * when the store still has the activate-bonus deposit gate enabled.
 */
async function isDepositRequiredForUser(userId, options = {}) {
  const type = await getActivationBonusType(userId, options);
  if (type == null) return false;
  return isActivationDepositGateEnabledForUser(userId, options);
}

/**
 * Whether the user may play slots and manage platform game balance.
 */
async function canUserPlayGames(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return false;

  const hasDeposit = await hasUserCompletedDeposit(uid, options);
  if (hasDeposit) return true;

  const depositRequired = await isDepositRequiredForUser(uid, options);
  return !depositRequired;
}

async function getGamePlayEligibility(userId, options = {}) {
  const [hasDeposit, activationBonusType, gateEnabled] = await Promise.all([
    hasUserCompletedDeposit(userId, options),
    getActivationBonusType(userId, options),
    isActivationDepositGateEnabledForUser(userId, options)
  ]);

  if (!hasDeposit) {
    const bscWallet = await ensureWallet(userId, BONUS_CURRENCY_CODE, options.transaction);
    const bonusLock = await resolveLockedBonusSc(userId, usableOf(bscWallet), {
      ...options,
      hasDeposit: false
    });
    if (bonusLock.locked) {
      return {
        has_deposit: false,
        can_play_games: false,
        activation_bonus_type: activationBonusType,
        require_deposit_to_activate_bonus: gateEnabled !== false,
        bonus_sc_locked: true,
        locked_balance_sc: bonusLock.lockedAmount,
        reason: PHONE_VERIFY_REQUIRED_CODE,
        message: PHONE_VERIFY_REQUIRED_MESSAGE,
        cta_path: '/settings'
      };
    }
  }

  const canPlay = hasDeposit || activationBonusType == null || gateEnabled === false;
  return {
    has_deposit: hasDeposit,
    can_play_games: canPlay,
    activation_bonus_type: activationBonusType,
    require_deposit_to_activate_bonus: gateEnabled !== false,
    bonus_sc_locked: false,
    locked_balance_sc: 0,
    reason: canPlay ? null : DEPOSIT_REQUIRED_CODE,
    message: canPlay ? null : messageForActivationBonus(activationBonusType),
    cta_path: '/deposit'
  };
}

async function assertUserCanPlayGames(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const eligibility = await getGamePlayEligibility(uid, options);
  if (eligibility.can_play_games) return;

  const err = new Error(eligibility.message || messageForActivationBonus(eligibility.activation_bonus_type));
  err.statusCode = 403;
  err.code = eligibility.reason || DEPOSIT_REQUIRED_CODE;
  err.activationBonusType = eligibility.activation_bonus_type;
  throw err;
}

module.exports = {
  DEPOSIT_REQUIRED_CODE,
  DEPOSIT_REQUIRED_MESSAGE: DEPOSIT_REQUIRED_MESSAGE_WELCOME,
  DEPOSIT_REQUIRED_MESSAGE_WELCOME,
  DEPOSIT_REQUIRED_MESSAGE_REFERRAL,
  PHONE_VERIFY_REQUIRED_CODE,
  PHONE_VERIFY_REQUIRED_MESSAGE,
  ACTIVATION_BONUS_WELCOME,
  ACTIVATION_BONUS_REFERRAL,
  hasUserCompletedDeposit,
  hasReceivedWelcomeSignupBonus,
  hasReceivedReferralFriendSignupBonus,
  getActivationBonusType,
  isDepositRequiredForUser,
  canUserPlayGames,
  getGamePlayEligibility,
  assertUserCanPlayGames
};
