'use strict';

const db = require('../../db/models');
const { isKycRequiredForWithdraw } = require('./kycSettings.service');
const { isApproved } = require('./kycStatus.map');

/**
 * Throws 403 if KYC is required for this user's store and they are not approved.
 * No-op when Didit is disabled, not configured, or store is outside KYC_STORE_CODES.
 */
async function assertKycForWithdraw(userId) {
  const user = await db.User.findByPk(userId, {
    attributes: ['userId', 'kycStatus', 'kycVerifiedAt', 'storeCode'],
    raw: true
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const required = await isKycRequiredForWithdraw(user.storeCode);
  if (!required) return { required: false, kycStatus: null };

  if (isApproved(user.kycStatus)) {
    return { required: true, kycStatus: 'approved', kycVerifiedAt: user.kycVerifiedAt };
  }

  const status = user.kycStatus || 'not_started';
  const err = new Error(
    status === 'pending' || status === 'in_review'
      ? 'Identity verification is still in progress. You can withdraw once KYC is approved.'
      : status === 'declined'
        ? 'Identity verification was declined. Please contact support or retry KYC before withdrawing.'
        : 'Complete identity verification (KYC) once before you can withdraw.'
  );
  err.statusCode = 403;
  err.code = 'KYC_REQUIRED';
  err.kycStatus = status;
  throw err;
}

module.exports = { assertKycForWithdraw };
