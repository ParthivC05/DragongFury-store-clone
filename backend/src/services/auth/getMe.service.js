const db = require('../../db/models');

/**
 * @param {number} userId
 * @param {{ skipEmailVerification?: boolean }} [options] Kept for admin callers (ignored).
 */
async function getMe(userId, _options = {}) {
  const user = await db.User.findByPk(userId, {
    attributes: { exclude: ['password', 'emailVerificationToken', 'passwordResetToken'] }
  });
  if (!user) {
    const err = new Error('Your session may have expired. Please sign in again.');
    err.statusCode = 404;
    throw err;
  }
  const data = (user.toSafeJSON && user.toSafeJSON()) || (user.toJSON ? user.toJSON() : user);
  delete data.emailVerificationToken;
  delete data.passwordResetToken;

  const { phoneStatusForUser } = require('../phone/phoneOtp.service');
  const phoneStatus = await phoneStatusForUser(user);
  data.isPhoneVerified = Boolean(user.isPhoneVerified);
  data.phoneVerificationRequired = phoneStatus.needsVerification;
  data.phoneVerification = phoneStatus;

  return data;
}

module.exports = { getMe };
