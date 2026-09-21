const jwt = require('jsonwebtoken');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { sendVerificationEmailWithLink } = require('../../utils/email');
const { getResolvedUserSiteBaseUrl } = require('../store/userSiteUrl.service');
const { normalizeStoreCode, resolveStoreFromCode } = require('./storeBinding.helpers');

async function refreshEmailToken(email, options = {}) {
  if (!email || typeof email !== 'string') {
    const err = new Error('Email is required.');
    err.statusCode = 400;
    throw err;
  }
  const emailNorm = email.toLowerCase().trim();

  // Per-store: when storeCode provided, find by (email, storeCode)
  let storeCode = null;
  if (options.storeCode) {
    const resolved = await resolveStoreFromCode(normalizeStoreCode(options.storeCode));
    if (resolved) storeCode = resolved.storeCode;
  }

  let user;
  if (storeCode) {
    user = await db.User.findOne({ where: { email: emailNorm, storeCode, isActive: true } });
  } else {
    const users = await db.User.findAll({ where: { email: emailNorm, isActive: true } });
    if (users.length === 0) user = null;
    else if (users.length === 1) user = users[0];
    else {
      const err = new Error('Multiple accounts found with this email. Please use the verification link from your store\'s website.');
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
  if (user.isEmailVerified) {
    const err = new Error('This email is already verified. You can sign in.');
    err.statusCode = 400;
    throw err;
  }

  const emailTokenKey = config.get('jwt.emailTokenKey');
  const emailTokenExpiry = config.get('jwt.emailTokenExpiry');
  if (!emailTokenKey || !emailTokenExpiry) {
    const err = new Error('Email verification is not configured.');
    err.statusCode = 500;
    throw err;
  }

  const storeCodeForUrl = options.storeCode != null ? String(options.storeCode).trim() : (user.storeCode || '').trim();
  const emailToken = jwt.sign(
    { userId: user.userId },
    emailTokenKey,
    { expiresIn: emailTokenExpiry }
  );
  const base = await getResolvedUserSiteBaseUrl(storeCodeForUrl || undefined);
  const verifyLink = `${base}/check-email?emailToken=${encodeURIComponent(emailToken)}`;

  try {
    await sendVerificationEmailWithLink(user.email, verifyLink, undefined, { storeCode: storeCodeForUrl });
  } catch (emailErr) {
    const err = new Error("We're facing some issue. Please try again later.");
    err.statusCode = emailErr.statusCode || 503;
    err.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw err;
  }
  await user.update({
    emailVerificationToken: emailToken,
    emailVerificationTokenExpiresAt: null
  });

  return { message: 'Verification email sent. Please check your inbox.' };
}

module.exports = { refreshEmailToken };
