'use strict';

const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');
const { isAdminPanelAccount, ROLES, normalizeRoleKey } = require('../../constants/roles');
const { normalizeStoreCode, FRIEND_SIGNUP_TX_TYPE } = require('./giveGetReferral.constants');
const { getEffectiveSettingsForStoreCode } = require('./getAffiliateSettings.service');

const log = createLogger('referralFriendSignupBonus');

function isCustomerUser(role, isAdmin) {
  if (isAdminPanelAccount(role, isAdmin)) return false;
  const normalized = normalizeRoleKey(role);
  return !normalized || normalized === ROLES.USER;
}

/**
 * Plain-language reason a referred friend has no signup SC transaction.
 * Uses the same rules as grantReferralFriendSignupBonus.
 */
function explainMissingFriendSignupBonus({ role, isAdmin, storeCode, referredBy, settings, createdAt }) {
  if (!referredBy) {
    return 'Reason: this player was not invited with a referral link';
  }
  if (!isCustomerUser(role, isAdmin)) {
    return 'Reason: this account is not a player account';
  }
  const normalizedStore = normalizeStoreCode(storeCode || '');
  if (!normalizedStore) {
    return 'Reason: friend has no store, so signup bonus could not be credited';
  }
  // Friend signup bonus feature went live ~2026-07-17
  if (createdAt) {
    const joined = new Date(createdAt);
    if (!Number.isNaN(joined.getTime()) && joined < new Date('2026-07-17T00:00:00.000Z')) {
      return 'Reason: signed up before friend signup bonus was enabled (before 17 Jul 2026)';
    }
  }
  const credit = settings != null ? Number(settings.friendSignupBonusSc) || 0 : null;
  if (credit != null && !(credit > 0)) {
    return 'Reason: friend signup bonus is set to 0 SC in Refer & Earn settings';
  }
  if (credit != null && credit > 0) {
    return 'Reason: signed up with invite link but friend signup SC was not credited at that time';
  }
  return 'Reason: signup bonus was not credited';
}

async function hasAlreadyGrantedFriendSignupBonus(userId, transaction) {
  const existing = await db.UserTransaction.findOne({
    where: { userId, type: FRIEND_SIGNUP_TX_TYPE },
    attributes: ['id'],
    transaction
  });
  return !!existing;
}

/**
 * Credit referred friend signup bonus when store programMode is give_get.
 * Amount comes from per-store affiliate settings. Idempotent per user.
 */
async function grantReferralFriendSignupBonus(userId, options = {}, transaction = null) {
  const clientStoreCode = normalizeStoreCode(
    options.clientStoreCode ?? options.client_store_code ?? ''
  );

  const user = await db.User.findByPk(userId, {
    attributes: ['userId', 'storeCode', 'distributorCode', 'role', 'isAdmin', 'userReferredBy']
  });
  if (!user) return null;
  if (!user.userReferredBy) {
    log.info('Referral friend signup bonus skipped: not referred', { userId });
    return null;
  }
  if (!isCustomerUser(user.role, user.isAdmin)) {
    log.info('Referral friend signup bonus skipped: not a player account', { userId });
    return null;
  }

  const storeCode = normalizeStoreCode(user.storeCode) || clientStoreCode;
  if (!storeCode) {
    log.warn('Referral friend signup bonus skipped: no store code', { userId, referredBy: user.userReferredBy });
    return null;
  }

  const affiliateSettings = await getEffectiveSettingsForStoreCode(storeCode);
  const credit = Number(affiliateSettings.friendSignupBonusSc) || 0;
  if (!(credit > 0)) {
    log.info('Referral friend signup bonus skipped: amount is 0', { userId, storeCode });
    return null;
  }

  const run = async (t) => {
    const freshUser = await db.User.findByPk(userId, {
      attributes: ['userId', 'storeCode', 'distributorCode', 'role', 'isAdmin', 'userReferredBy'],
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!freshUser?.userReferredBy || !isCustomerUser(freshUser.role, freshUser.isAdmin)) {
      return null;
    }
    if (await hasAlreadyGrantedFriendSignupBonus(userId, t)) {
      return null;
    }

    if (!freshUser.storeCode && clientStoreCode) {
      await freshUser.update({ storeCode: clientStoreCode }, { transaction: t });
    }

    const currencyCode = BONUS_CURRENCY_CODE;
    await creditBonusSc(userId, credit, {
      transaction: t,
      ledger: {
        eventType: 'REFERRAL_BONUS',
        bonusType: 'REFERRAL_BONUS',
        sourceType: 'REFERRAL_FRIEND_SIGNUP',
        sourceId: userId,
        remarks: 'Referral friend signup bonus'
      }
    });

    await db.UserTransaction.create(
      {
        userId,
        type: FRIEND_SIGNUP_TX_TYPE,
        amount: credit,
        currencyCode,
        description: `Referral signup bonus: ${credit} BSC`,
        metadata: {
          source: 'referral_friend_signup',
          bonusSc: credit,
          referred_by: freshUser.userReferredBy,
          program: affiliateSettings.programMode || 'give_get',
          storeCode
        }
      },
      { transaction: t }
    );

    if (db.Notification) {
      await db.Notification.create(
        {
          userId,
          type: 'referral_friend_signup',
          title: 'Referral bonus',
          message: `You received ${credit} SC for joining with a friend's link!`,
          actionUrl: '/account/affiliate'
        },
        { transaction: t }
      );
    }

    log.info('Referral friend signup bonus granted', { userId, amountSc: credit, storeCode });
    return { granted: true, amount_sc: credit };
  };

  if (transaction) return run(transaction);
  return db.sequelize.transaction(run);
}

async function tryGrantReferralFriendSignupBonus(userId, options = {}) {
  try {
    return await grantReferralFriendSignupBonus(userId, options);
  } catch (err) {
    log.warn('Referral friend signup bonus failed', { userId, message: err.message });
    return null;
  }
}

module.exports = {
  grantReferralFriendSignupBonus,
  tryGrantReferralFriendSignupBonus,
  explainMissingFriendSignupBonus,
  FRIEND_SIGNUP_TX_TYPE
};
