const jwt = require('jsonwebtoken');
const config = require('../../configs/app.config');
const db = require('../../db/models');
const {
  generateVerificationToken,
  getVerificationExpiry,
  sendVerificationEmail,
  sendVerificationEmailWithLink
} = require('../../utils/email');
const { getResolvedUserSiteBaseUrl } = require('../store/userSiteUrl.service');

async function sendVerificationEmailService(userId, options = {}) {
  const user = await db.User.findByPk(userId);
  if (!user) {
    const err = new Error('Your session may have expired. Please sign in again.');
    err.statusCode = 404;
    throw err;
  }
  if (user.isEmailVerified) {
    const err = new Error('Your email is already verified.');
    err.statusCode = 400;
    throw err;
  }

  const storeCodeForUrl = options.storeCode != null ? String(options.storeCode).trim() : (user.storeCode || '').trim();
  const emailTokenKey = config.get('jwt.emailTokenKey');
  const emailTokenExpiry = config.get('jwt.emailTokenExpiry');
  if (emailTokenKey && emailTokenExpiry) {
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

  const token = generateVerificationToken();
  const expiresAt = getVerificationExpiry();
  await user.update({
    emailVerificationToken: token,
    emailVerificationTokenExpiresAt: expiresAt
  });
  try {
    const baseUrl = await getResolvedUserSiteBaseUrl(storeCodeForUrl || undefined);
    await sendVerificationEmail(user.email, token, { baseUrl, storeCode: storeCodeForUrl });
  } catch (emailErr) {
    const err = new Error("We're facing some issue. Please try again later.");
    err.statusCode = emailErr.statusCode || 503;
    err.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw err;
  }
  return { message: 'Verification email sent. Please check your inbox.' };
}

module.exports = { sendVerificationEmailService };
