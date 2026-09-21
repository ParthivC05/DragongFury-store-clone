const jwt = require('jsonwebtoken');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { createAccessToken } = require('../../helpers/authentication.helpers');
const { sendAccountVerifiedEmail } = require('../../utils/email');
const { logger } = require('../../libs/logger');

function toSafeUser(user) {
  const safe = user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.emailVerificationTokenExpiresAt;
  delete safe.passwordResetToken;
  delete safe.passwordResetTokenExpiresAt;
  return safe;
}

function isJwtFormat(str) {
  if (!str || typeof str !== 'string') return false;
  const parts = str.trim().split('.');
  return parts.length >= 3;
}

async function verifyEmail(emailTokenOrToken) {
  const raw = (emailTokenOrToken != null ? emailTokenOrToken : '').toString().trim();
  if (!raw) {
    const err = new Error('Invalid verification link. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }

  if (isJwtFormat(raw)) {
    const emailTokenKey = config.get('jwt.emailTokenKey');
    if (!emailTokenKey) {
      const err = new Error('Email verification is not configured.');
      err.statusCode = 500;
      throw err;
    }
    let token = raw;
    const dotParts = token.split('.');
    if (dotParts.length > 3) {
      token = dotParts.slice(0, 3).join('.');
    }
    let payload;
    try {
      payload = jwt.verify(token, emailTokenKey);
    } catch (e) {
      const err = new Error('This verification link has expired or is invalid. Please request a new one.');
      err.statusCode = 400;
      throw err;
    }
    const userId = payload.userId;
    if (!userId) {
      const err = new Error('Invalid verification link.');
      err.statusCode = 400;
      throw err;
    }
    const user = await db.User.findOne({ where: { userId, isActive: true } });
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    await user.update({
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null
    });
    try {
      await sendAccountVerifiedEmail(user.email, { storeCode: user.storeCode });
    } catch (emailErr) {
      logger.warn({ err: emailErr, userId: user.userId }, 'Account verified email send failed');
    }
    const accessToken = createAccessToken(user);
    return {
      success: true,
      message: 'Your email has been verified. You can now use your account.',
      token: accessToken,
      user: toSafeUser(user)
    };
  }

  const user = await db.User.findOne({
    where: { emailVerificationToken: raw }
  });
  if (!user) {
    const err = new Error('Invalid or expired verification link. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }
  const expiresAt = user.emailVerificationTokenExpiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    await user.update({
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null
    });
    const err = new Error('This verification link has expired. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }
  await user.update({
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null
  });
  try {
    await sendAccountVerifiedEmail(user.email, { storeCode: user.storeCode });
  } catch (emailErr) {
    logger.warn({ err: emailErr, userId: user.userId }, 'Account verified email send failed');
  }
  const accessToken = createAccessToken(user);
  return {
    success: true,
    message: 'Your email has been verified. You can now use deposit and withdraw.',
    token: accessToken,
    user: toSafeUser(user)
  };
}

module.exports = { verifyEmail };
