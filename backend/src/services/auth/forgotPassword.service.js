const db = require('../../db/models');
const {
  generatePasswordResetToken,
  getPasswordResetExpiry,
  sendPasswordResetEmail
} = require('../../utils/email');
const { getResolvedUserSiteBaseUrl } = require('../store/userSiteUrl.service');
const { normalizeStoreCode, resolveStoreFromCode } = require('./storeBinding.helpers');

async function forgotPassword(email, options = {}) {
  const raw = email != null ? String(email).trim().toLowerCase() : '';
  if (!raw || raw.length < 3) {
    const err = new Error('Please enter a valid email address.');
    err.statusCode = 400;
    throw err;
  }

  // Per-store: when storeCode provided, find by (email, storeCode)
  let storeCode = null;
  if (options.storeCode) {
    const resolved = await resolveStoreFromCode(normalizeStoreCode(options.storeCode));
    if (resolved) storeCode = resolved.storeCode;
  }

  let user;
  if (storeCode) {
    user = await db.User.findOne({ where: { email: raw, storeCode } });
  } else {
    const users = await db.User.findAll({ where: { email: raw } });
    if (users.length === 0) user = null;
    else if (users.length === 1) user = users[0];
    else {
      const err = new Error('Multiple accounts found with this email. Please use the password reset link from your store\'s website.');
      err.statusCode = 400;
      err.code = 'MULTIPLE_ACCOUNTS';
      throw err;
    }
  }

  if (!user) {
    const err = new Error('No account found with this email.');
    err.statusCode = 404;
    throw err;
  }

  const storeCodeForUrl = options.storeCode != null ? String(options.storeCode).trim() : (user.storeCode || '').trim();
  const token = generatePasswordResetToken();
  const expiresAt = getPasswordResetExpiry();
  await user.update({
    passwordResetToken: token,
    passwordResetTokenExpiresAt: expiresAt
  });
  try {
    const baseUrl = await getResolvedUserSiteBaseUrl(storeCodeForUrl || undefined);
    await sendPasswordResetEmail(user.email, token, { baseUrl, storeCode: storeCodeForUrl });
  } catch (emailErr) {
    const err = new Error('Password reset service is not working for now. Please try again later.');
    err.statusCode = 503;
    err.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw err;
  }
  return { message: 'Password reset link has been sent to your email successfully.' };
}

module.exports = { forgotPassword };
