'use strict';

const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { sendPhoneCode, checkPhoneCode } = require('../kyc/didit.client');
const { isPhoneVerificationRequiredForStore } = require('./phoneSettings.service');
const { isAdminPanelAccount } = require('../../constants/roles');
const { logger } = require('../../libs/logger');

const TOKEN_PURPOSE = 'didit_phone_verified';
const TOKEN_EXPIRY = '20m';
const LOGIN_CHALLENGE_PURPOSE = 'didit_phone_login_challenge';
const LOGIN_CHALLENGE_EXPIRY = '15m';

/**
 * Normalize to E.164-ish. Prefer +1 for bare US 10-digit numbers.
 */
function normalizePhoneE164(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    const digits = s.replace(/\D/g, '');
    if (digits.length === 10) s = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) s = `+${digits}`;
    else if (digits.length > 0) s = `+${digits}`;
  }
  return s;
}

function assertValidPhone(phone) {
  const normalized = normalizePhoneE164(phone);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    const err = new Error('Enter a valid mobile number with country code (e.g. +14155552671).');
    err.statusCode = 400;
    err.code = 'INVALID_PHONE';
    throw err;
  }
  return normalized;
}

function createPhoneVerificationToken(phone) {
  const secret = config.get('jwt.tokenSecret');
  if (!secret) {
    const err = new Error('Server auth is not configured.');
    err.statusCode = 503;
    throw err;
  }
  return jwt.sign({ purpose: TOKEN_PURPOSE, phone }, secret, { expiresIn: TOKEN_EXPIRY });
}

function consumePhoneVerificationToken(token, expectedPhone) {
  const secret = config.get('jwt.tokenSecret');
  if (!secret) {
    const err = new Error('Server auth is not configured.');
    err.statusCode = 503;
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(String(token || ''), secret);
  } catch {
    const err = new Error('Phone verification expired or invalid. Please verify again.');
    err.statusCode = 400;
    err.code = 'PHONE_TOKEN_INVALID';
    throw err;
  }
  if (!payload || payload.purpose !== TOKEN_PURPOSE || !payload.phone) {
    const err = new Error('Phone verification expired or invalid. Please verify again.');
    err.statusCode = 400;
    err.code = 'PHONE_TOKEN_INVALID';
    throw err;
  }
  const expected = normalizePhoneE164(expectedPhone);
  if (payload.phone !== expected) {
    const err = new Error('Verified phone does not match. Please verify again.');
    err.statusCode = 400;
    err.code = 'PHONE_MISMATCH';
    throw err;
  }
  return payload.phone;
}

function createPhoneLoginChallenge(userId, storeCode) {
  const secret = config.get('jwt.tokenSecret');
  if (!secret) {
    const err = new Error('Server auth is not configured.');
    err.statusCode = 503;
    throw err;
  }
  return jwt.sign(
    {
      purpose: LOGIN_CHALLENGE_PURPOSE,
      userId: Number(userId),
      storeCode: storeCode || null
    },
    secret,
    { expiresIn: LOGIN_CHALLENGE_EXPIRY }
  );
}

function verifyPhoneLoginChallenge(token) {
  const secret = config.get('jwt.tokenSecret');
  if (!secret) {
    const err = new Error('Server auth is not configured.');
    err.statusCode = 503;
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(String(token || ''), secret);
  } catch {
    const err = new Error('Phone verification session expired. Please sign in again.');
    err.statusCode = 401;
    err.code = 'PHONE_CHALLENGE_INVALID';
    throw err;
  }
  if (!payload || payload.purpose !== LOGIN_CHALLENGE_PURPOSE || !payload.userId) {
    const err = new Error('Phone verification session expired. Please sign in again.');
    err.statusCode = 401;
    err.code = 'PHONE_CHALLENGE_INVALID';
    throw err;
  }
  return { userId: Number(payload.userId), storeCode: payload.storeCode || null };
}

/**
 * If phone OTP is still required, return a challenge payload (no access token).
 * Otherwise null.
 */
async function buildPhoneLoginChallengeResponse(user) {
  const status = await phoneStatusForUser(user);
  if (!status.needsVerification) return null;
  return {
    status: 'PHONE_VERIFICATION_REQUIRED',
    code: 'PHONE_VERIFICATION_REQUIRED',
    phoneChallengeToken: createPhoneLoginChallenge(user.userId, user.storeCode),
    phone: user.phone || null,
    email: user.email || null
  };
}

async function assertPhoneAvailable(phone, storeCode, excludeUserId = null) {
  const where = {
    phone,
    isPhoneVerified: true,
    deletedAt: null
  };
  if (storeCode) where.storeCode = storeCode;
  else where.storeCode = { [Op.is]: null };
  if (excludeUserId) where.userId = { [Op.ne]: excludeUserId };

  const taken = await db.User.findOne({ where, attributes: ['userId'] });
  if (taken) {
    const err = new Error('This phone number is already verified on another account.');
    err.statusCode = 400;
    err.code = 'PHONE_IN_USE';
    throw err;
  }
}

function interpretCheckResult(data) {
  const status = String(data?.status || '').toLowerCase();
  if (status === 'approved') return { ok: true, status: 'approved', data };
  if (status === 'failed') {
    const err = new Error('Incorrect code. Please try again.');
    err.statusCode = 400;
    err.code = 'OTP_FAILED';
    throw err;
  }
  if (status === 'declined') {
    const err = new Error('This phone number could not be verified. Try a different mobile number.');
    err.statusCode = 400;
    err.code = 'OTP_DECLINED';
    throw err;
  }
  if (status.includes('expired') || status.includes('not found')) {
    const err = new Error('Code expired. Request a new code and try again.');
    err.statusCode = 400;
    err.code = 'OTP_EXPIRED';
    throw err;
  }
  const err = new Error('Verification did not succeed. Please try again.');
  err.statusCode = 400;
  err.code = 'OTP_UNKNOWN';
  throw err;
}

/**
 * Public / auth / login-challenge: send OTP when phone verification is required for the store.
 */
async function sendOtp({ phone, storeCode, vendorData, phoneChallengeToken }) {
  let resolvedStore = storeCode;
  let resolvedVendor = vendorData;

  if (phoneChallengeToken) {
    const challenge = verifyPhoneLoginChallenge(phoneChallengeToken);
    const user = await db.User.findByPk(challenge.userId, {
      attributes: ['userId', 'storeCode', 'isPhoneVerified', 'role', 'isAdmin', 'phone']
    });
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    if (!(await phoneStatusForUser(user)).needsVerification) {
      const err = new Error('Phone is already verified. Please sign in again.');
      err.statusCode = 400;
      err.code = 'PHONE_ALREADY_VERIFIED';
      throw err;
    }
    resolvedStore = user.storeCode || challenge.storeCode;
    resolvedVendor = String(user.userId);
  }

  if (!(await isPhoneVerificationRequiredForStore(resolvedStore))) {
    return {
      sent: false,
      skipped: true,
      required: false,
      phone: phone ? normalizePhoneE164(phone) || null : null
    };
  }
  const normalized = assertValidPhone(phone);
  const excludeId = resolvedVendor && /^\d+$/.test(String(resolvedVendor)) ? Number(resolvedVendor) : null;
  await assertPhoneAvailable(normalized, resolvedStore || null, excludeId);

  const result = await sendPhoneCode({
    phoneNumber: normalized,
    vendorData: resolvedVendor || undefined,
    preferredChannel: 'sms'
  });

  const sendStatus = String(result?.status || '').toLowerCase();
  if (sendStatus === 'blocked') {
    const err = new Error(
      'Temporary or virtual numbers are not allowed. Please use a real mobile number.'
    );
    err.statusCode = 429;
    err.code = 'OTP_BLOCKED';
    throw err;
  }

  logger.info('[phone otp] send', {
    phone: normalized.slice(0, 4) + '***',
    storeCode: resolvedStore,
    status: result?.status
  });
  return {
    sent: true,
    phone: normalized,
    status: result?.status || 'Success',
    requestId: result?.request_id || null
  };
}

/**
 * Public check — returns short-lived token for signup (does not update a user).
 */
async function checkOtpPublic({ phone, code, storeCode, vendorData }) {
  if (!(await isPhoneVerificationRequiredForStore(storeCode))) {
    return {
      verified: false,
      skipped: true,
      required: false,
      phone: phone ? normalizePhoneE164(phone) || null : null
    };
  }
  const normalized = assertValidPhone(phone);
  await assertPhoneAvailable(normalized, storeCode || null);

  const result = await checkPhoneCode({
    phoneNumber: normalized,
    code,
    vendorData: vendorData || undefined
  });
  interpretCheckResult(result);

  const phoneVerificationToken = createPhoneVerificationToken(normalized);
  return {
    verified: true,
    phone: normalized,
    phoneVerificationToken
  };
}

/**
 * Authenticated check — marks user phone verified.
 */
async function checkOtpForUser({ userId, phone, code, storeCode }) {
  const user = await db.User.findByPk(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  if (isAdminPanelAccount(user.role, user.isAdmin)) {
    return { verified: true, skipped: true, user: user.toJSON ? user.toJSON() : user };
  }

  const sc = storeCode || user.storeCode;
  if (!(await isPhoneVerificationRequiredForStore(sc))) {
    const phoneStatus = await phoneStatusForUser(user);
    return {
      verified: Boolean(user.isPhoneVerified),
      skipped: true,
      required: false,
      phone: user.phone || null,
      user: {
        ...sanitizeUser(user),
        phoneVerificationRequired: false,
        phoneVerification: phoneStatus
      }
    };
  }
  if (user.isPhoneVerified) {
    return {
      verified: true,
      alreadyVerified: true,
      phone: user.phone,
      user: sanitizeUser(user)
    };
  }

  const normalized = assertValidPhone(phone);
  await assertPhoneAvailable(normalized, sc || null, userId);

  const result = await checkPhoneCode({
    phoneNumber: normalized,
    code,
    vendorData: String(userId)
  });
  interpretCheckResult(result);

  await user.update({
    phone: normalized,
    isPhoneVerified: true,
    phoneVerifiedAt: new Date()
  });
  await user.reload();

  try {
    const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');
    notifyUserBalanceChanged(userId);
  } catch {
    /* never block OTP success on wallet push */
  }

  const phoneStatus = await phoneStatusForUser(user);
  return {
    verified: true,
    phone: normalized,
    user: {
      ...sanitizeUser(user),
      isPhoneVerified: true,
      phoneVerificationRequired: phoneStatus.needsVerification,
      phoneVerification: phoneStatus
    }
  };
}

/**
 * Finish login after password/SSO challenge: verify OTP, then issue access token.
 */
async function completePhoneLogin({ phoneChallengeToken, phone, code }) {
  const challenge = verifyPhoneLoginChallenge(phoneChallengeToken);
  const result = await checkOtpForUser({
    userId: challenge.userId,
    phone,
    code,
    storeCode: challenge.storeCode
  });
  const user = await db.User.findByPk(challenge.userId);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  const { createAccessToken } = require('../../helpers/authentication.helpers');
  const token = createAccessToken(user);
  return {
    verified: true,
    phone: result.phone || phone,
    user: sanitizeUser(user),
    token
  };
}

function sanitizeUser(user) {
  const safe = user.toSafeJSON ? user.toSafeJSON() : user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.passwordResetToken;
  delete safe.paymentApiPasswordEncrypted;
  return safe;
}

async function phoneStatusForUser(user) {
  if (!user) {
    return { required: false, verified: false, phone: null, needsVerification: false };
  }
  if (isAdminPanelAccount(user.role, user.isAdmin)) {
    return {
      required: false,
      verified: true,
      phone: user.phone || null,
      phoneVerifiedAt: user.phoneVerifiedAt || null,
      needsVerification: false
    };
  }
  const required = await isPhoneVerificationRequiredForStore(user.storeCode);
  const verified = Boolean(user.isPhoneVerified);
  return {
    required,
    verified,
    phone: user.phone || null,
    phoneVerifiedAt: user.phoneVerifiedAt || null,
    needsVerification: required && !verified
  };
}

module.exports = {
  normalizePhoneE164,
  assertValidPhone,
  createPhoneVerificationToken,
  consumePhoneVerificationToken,
  createPhoneLoginChallenge,
  verifyPhoneLoginChallenge,
  buildPhoneLoginChallengeResponse,
  assertPhoneAvailable,
  sendOtp,
  checkOtpPublic,
  checkOtpForUser,
  completePhoneLogin,
  phoneStatusForUser,
  isPhoneVerificationRequiredForStore
};
