const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { Op } = require('sequelize');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');
const { sendVerificationEmailWithLink } = require('../../utils/email');
const { ROLES } = require('../../constants/roles');
const { createAccessToken } = require('../../helpers/authentication.helpers');

/** Normalize code for store/distributor lookup: lowercase alphanumeric */
function normalizeCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function trimmedOrNull(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s || null;
}

/** Generate a unique referral code (alphanumeric, ~10 chars). */
function generateReferralCode() {
  return crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || `R${Date.now().toString(36).toUpperCase()}`;
}

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
/** Only letters a-z, A-Z; no numbers, spaces, hyphens, underscores, or special characters. */
const nameLettersOnly = /^[a-zA-Z]+$/;

/** Case-insensitive username lookup. When storeCode provided, scoped to that store (per-store uniqueness). */
async function findUserByUsername(username, storeCode = null) {
  if (!username || typeof username !== 'string') return null;
  const normalized = username.trim();
  if (!normalized) return null;
  const whereClause = {
    [Op.and]: [
      db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.col('username')),
        Op.eq,
        normalized.toLowerCase()
      )
    ]
  };
  if (storeCode) {
    whereClause[Op.and].push({ storeCode });
  } else {
    whereClause[Op.and].push(db.sequelize.where(db.sequelize.col('store_code'), Op.is, null));
  }
  return db.User.findOne({ where: whereClause });
}

function toSafeUser(user) {
  const safe = user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.paymentApiPasswordEncrypted;
  return safe;
}

async function resolveSignupCode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return { referredByUserId: null, distributorCode: null, storeCode: null };
  const trimmed = String(rawCode).trim();
  if (!trimmed) return { referredByUserId: null, distributorCode: null, storeCode: null };

  const referralUpper = trimmed.toUpperCase();
  const codeNormalized = normalizeCode(trimmed);

  // 1) User referral code (refer & earn): link passes the referrer's userReferralCode
  const referrer = await db.User.findOne({
    where: { userReferralCode: referralUpper },
    attributes: ['userId', 'distributorCode', 'storeCode']
  });
  if (referrer) {
    return {
      referredByUserId: referrer.userId,
      distributorCode: referrer.distributorCode || null,
      storeCode: referrer.storeCode || null
    };
  }

  // 2) Store code only: matches a store_admin's storeCode. Distributor code is NOT accepted for signup.
  if (codeNormalized) {
    const storeAdmin = await db.User.findOne({
      where: { role: ROLES.STORE_ADMIN, storeCode: codeNormalized, isActive: true, deletedAt: null },
      attributes: ['distributorCode', 'storeCode']
    });
    if (storeAdmin) {
      return {
        referredByUserId: null,
        distributorCode: storeAdmin.distributorCode || null,
        storeCode: storeAdmin.storeCode || null
      };
    }
  }

  const err = new Error('Wrong code or code does not exist. Please use your store code.');
  err.statusCode = 400;
  err.code = 'INVALID_REFERRAL_CODE';
  throw err;
}

/**
 * ref / affiliateCode: friend referral only (userReferralCode). Store codes are not accepted here.
 */
async function resolveReferralFieldOnly(rawRef) {
  const trimmed = trimmedOrNull(rawRef);
  if (!trimmed) return null;
  const referralUpper = String(trimmed).trim().toUpperCase();
  const referrer = await db.User.findOne({
    where: { userReferralCode: referralUpper },
    attributes: ['userId', 'distributorCode', 'storeCode']
  });
  if (!referrer) {
    const err = new Error(
      'Invalid referral code. Enter a friend\'s referral code only—the store code cannot be used here.'
    );
    err.statusCode = 400;
    err.code = 'INVALID_REFERRAL_CODE';
    throw err;
  }
  return {
    referredByUserId: referrer.userId,
    distributorCode: referrer.distributorCode || null,
    storeCode: referrer.storeCode || null
  };
}

async function register(body, options = {}) {
  const {
    email,
    password,
    username: rawUsername,
    firstName,
    lastName,
    ref: refCode,
    affiliateCode,
    code: codeField,
    clientStoreCode
  } = body || {};
  const refOnly = trimmedOrNull(refCode) || trimmedOrNull(affiliateCode);
  const codeStore = trimmedOrNull(codeField);

  let referredByUserId = null;
  let distributorCode = null;
  let storeCode = null;

  if (refOnly) {
    const resolved = await resolveReferralFieldOnly(refOnly);
    referredByUserId = resolved.referredByUserId;
    distributorCode = resolved.distributorCode;
    storeCode = resolved.storeCode;
  } else if (codeStore) {
    const resolved = await resolveSignupCode(codeStore);
    referredByUserId = resolved.referredByUserId;
    distributorCode = resolved.distributorCode;
    storeCode = resolved.storeCode;
  }

  // Fallback: use clientStoreCode from URL/site when no code/ref provided (per-store account flow)
  if (!storeCode && (clientStoreCode || body?.storeCode)) {
    const { resolveStoreFromCode } = require('./storeBinding.helpers');
    const { isBonusPlaythroughStore } = require('../wallet/bonusPlaythrough.constants');
    const clientCode = normalizeCode(clientStoreCode || body.storeCode);
    const resolved = await resolveStoreFromCode(clientCode);
    if (resolved) {
      storeCode = resolved.storeCode;
      distributorCode = distributorCode || resolved.distributorCode;
    } else if (clientCode && isBonusPlaythroughStore(clientCode)) {
      // White-label DragonFury: keep store binding when store_admin row is missing (e.g. local dev).
      storeCode = clientCode;
    }
  }

  const resolvedClientStoreCode = normalizeCode(clientStoreCode || body?.storeCode || storeCode || '');

  const rawBonus = trimmedOrNull(body.bonusCode) || trimmedOrNull(body.bc);
  let signupBonusCodeId = null;
  if (rawBonus) {
    if (!storeCode) {
      const err = new Error('A store is required to use a bonus code.');
      err.statusCode = 400;
      err.code = 'INVALID_BONUS_CODE';
      throw err;
    }
    const { resolveSignupBonusCodeForRegister } = require('../bonusCodes/resolveSignupBonusCodeForRegister.service');
    signupBonusCodeId = await resolveSignupBonusCodeForRegister(rawBonus, storeCode);
  }

  if (!email || !password) {
    const err = new Error('Please enter your email and password.');
    err.statusCode = 400;
    throw err;
  }
  const emailNorm = String(email).toLowerCase().trim();
  if (!emailRegex.test(emailNorm)) {
    const err = new Error('Please enter a valid email address.');
    err.statusCode = 400;
    throw err;
  }
  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) {
    const err = new Error(pwdCheck.error);
    err.statusCode = 400;
    throw err;
  }
  // Per-store uniqueness: (email, storeCode) - same email can exist in different stores
  const emailWhere = storeCode ? { email: emailNorm, storeCode } : { email: emailNorm };
  const existingByEmail = await db.User.findOne({ where: emailWhere });
  if (existingByEmail) {
    const err = new Error('An account with this email already exists for this store. Try signing in or use a different email.');
    err.statusCode = 400;
    throw err;
  }

  const isUsernameProvided = rawUsername != null && String(rawUsername).trim() !== '';
  let username = isUsernameProvided ? String(rawUsername).trim() : (emailNorm.split('@')[0] || `user_${Date.now()}`);

  const existingByUsername = await findUserByUsername(username, storeCode || undefined);
  if (existingByUsername) {
    if (isUsernameProvided) {
      const err = new Error('This username is already taken. Please choose another.');
      err.statusCode = 400;
      throw err;
    }
    let suffix = 1;
    while (true) {
      const candidate = `${username}${suffix}`;
      const taken = await findUserByUsername(candidate, storeCode || undefined);
      if (!taken) {
        username = candidate;
        break;
      }
      suffix += 1;
    }
  }
  const trimmedFirst = firstName ? String(firstName).trim() : '';
  const trimmedLast = lastName ? String(lastName).trim() : '';
  const payment = require('../payment');
  if (payment.isPaymentConfigured() && (!trimmedFirst || !trimmedLast)) {
    const err = new Error('First name and last name are required for account creation.');
    err.statusCode = 400;
    throw err;
  }
  const nameError = 'First and last name can only contain letters (a-z, A-Z); no numbers, spaces, hyphens, or special characters.';
  if (trimmedFirst && !nameLettersOnly.test(trimmedFirst)) {
    const err = new Error(nameError);
    err.statusCode = 400;
    throw err;
  }
  if (trimmedLast && !nameLettersOnly.test(trimmedLast)) {
    const err = new Error(nameError);
    err.statusCode = 400;
    throw err;
  }

  let userReferralCode = generateReferralCode();
  let exists = await db.User.findOne({ where: { userReferralCode }, attributes: ['userId'] });
  while (exists) {
    userReferralCode = generateReferralCode();
    exists = await db.User.findOne({ where: { userReferralCode }, attributes: ['userId'] });
  }

  const emailTokenKey = config.get('jwt.emailTokenKey');
  const emailTokenExpiry = config.get('jwt.emailTokenExpiry');
  const useEmailVerification = !!(emailTokenKey && emailTokenExpiry);

  const { enforceSignupDevicePolicy } = require('./fingerprintSignup.service');
  const deviceVisitorId = await enforceSignupDevicePolicy({
    fingerprintRequestId: body.fingerprintRequestId,
    storeCode,
    clientIps: options.clientIps
  });

  let user;
  try {
    user = await db.User.create({
      email: emailNorm,
      password: encryptPassword(password),
      username,
      firstName: trimmedFirst || null,
      lastName: trimmedLast || null,
      signInType: 'NORMAL',
      // Email verification is the signup gate; phone OTP is enforced at first purchase.
      isEmailVerified: !useEmailVerification,
      isPhoneVerified: false,
      phoneVerifiedAt: null,
      userReferralCode,
      userReferredBy: referredByUserId,
      distributorCode: distributorCode || undefined,
      storeCode: storeCode || undefined,
      signupBonusCodeId: signupBonusCodeId || undefined,
      ...(deviceVisitorId && { deviceVisitorId })
    });
  } catch (createErr) {
    const logger = require('../../libs/logger').logger;
    const parent = createErr.parent || createErr.original;
    const constraint = createErr.constraint || parent?.constraint;
    const detail = parent?.detail || parent?.message;
    logger.error('User.create failed', {
      constraint,
      detail,
      message: createErr.message,
      name: createErr.name
    });
    if (createErr.name === 'SequelizeUniqueConstraintError' || (parent && parent.code === '23505')) {
      const err = new Error(
        constraint && constraint.includes('email')
          ? 'An account with this email already exists for this store. Try signing in or use a different email.'
          : constraint && constraint.includes('username')
            ? 'This username is already taken in this store. Please try again.'
            : 'An account with this email or username already exists. Please sign in or use different details.'
      );
      err.statusCode = 400;
      throw err;
    }
    throw createErr;
  }

  const { paymentLog } = require('../../libs/logger');
  const logger = require('../../libs/logger').logger;
  const { encryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
  let paymentAccountCreated = false;
  let paymentAccountLinkRequired = false;
  if (payment.isPaymentConfigured() && isPaymentPasswordEncryptionConfigured()) {
    paymentLog('--- register: step 1 – try to CREATE Payment API account (signup/direct) ---');
    const paymentPassword = password;
    paymentLog('register: email=', emailNorm, 'firstName=', trimmedFirst || '', 'lastName=', trimmedLast || '');
    try {
      await payment.signupUserDirect({
        firstName: trimmedFirst || '',
        lastName: trimmedLast || '',
        email: emailNorm,
        password: paymentPassword,
        partnerCode: options.paymentPartnerCode
      });
      const encrypted = encryptPaymentPassword(paymentPassword);
      if (encrypted) {
        await user.update({
          paymentApiPasswordEncrypted: encrypted,
          paymentApiEmail: emailNorm,
          paymentAccountCreatedByPlatform: true
        });
      }
      paymentAccountCreated = true;
      paymentLog('register: step 1 result – CREATE SUCCESS. Payment account created for new user.');
    } catch (paymentErr) {
      const statusCode = paymentErr.statusCode ?? paymentErr.response?.status;
      const responseBody = paymentErr.response;
      const rawMsg =
        (responseBody && typeof responseBody === 'object' && (responseBody.message || responseBody.error || responseBody.msg)) ||
        (typeof responseBody === 'string' ? responseBody : null) ||
        paymentErr.message ||
        '';
      const msg = String(rawMsg).toLowerCase();
      paymentLog('register: step 1 result – CREATE FAILED.');
      paymentLog('register: payment API error statusCode=', statusCode, 'message=', paymentErr.message);
      paymentLog('register: payment API error response body=', JSON.stringify(responseBody));
      logger.warn('[register] Payment API signup failed', {
        statusCode,
        message: paymentErr.message,
        responseMessage: responseBody?.message || responseBody?.error,
        email: emailNorm
      });
      // Only treat as "already exists" when the API explicitly says so (do NOT use statusCode 400 alone).
      const explicitlyAlreadyExists =
        msg.includes('already exists') ||
        msg.includes('user already exists') ||
        msg.includes('email already exists') ||
        msg.includes('already registered') ||
        msg.includes('account already exists');
      paymentLog('register: checked "already exists" – msg=', msg, 'explicitlyAlreadyExists=', explicitlyAlreadyExists);
      if (explicitlyAlreadyExists) {
        paymentAccountLinkRequired = true;
        paymentLog('register: step 2 – treating as ALREADY EXISTS → will show "link account" notification.');
      } else {
        paymentLog('register: step 2 – not "already exists" → no link notification. User can link from Profile if needed.');
      }
    }
    paymentLog('register: outcome paymentAccountCreated=', paymentAccountCreated, 'paymentAccountLinkRequired=', paymentAccountLinkRequired);
    if (db.Notification) {
      if (paymentAccountCreated) {
        await db.Notification.create({
          userId: user.userId,
          type: 'payment_account_created',
          title: 'Payment account set up',
          message: 'Your payment account is ready. View your login details on the Payment Account page.',
          actionUrl: '/account/profile'
        });
        paymentLog('register: notification created – "Payment account set up".');
      } else if (paymentAccountLinkRequired) {
        await db.Notification.create({
          userId: user.userId,
          type: 'payment_account_link_required',
          title: 'Link your payment account',
          message: 'A payment account already exists for this email. Link it on the Payment Account page to start depositing.',
          actionUrl: '/account/profile'
        });
        paymentLog('register: notification created – "Link your payment account".');
      }
    }
  }

  const { ensureUserWalletSet } = require('../wallet/walletBuckets.service');
  await ensureUserWalletSet(user.userId);

  let guestSpinClaim = null;
  try {
    const { claimGuestLandingSpinFromBody } = require('../spinWheel/claimGuestLandingSpin.service');
    guestSpinClaim = await claimGuestLandingSpinFromBody(user.userId, body);
  } catch (claimErr) {
    logger.warn('[register] Guest landing spin claim failed', { message: claimErr.message, userId: user.userId });
  }

  let welcomeBonusGrant = null;
  let referralFriendBonusGrant = null;
  try {
    const { tryGrantReferralFriendSignupBonus } = require('../affiliate/grantReferralFriendSignupBonus.service');
    referralFriendBonusGrant = await tryGrantReferralFriendSignupBonus(user.userId, {
      clientStoreCode: resolvedClientStoreCode
    });
  } catch (refBonusErr) {
    logger.warn('[register] Referral friend signup bonus failed', {
      message: refBonusErr.message,
      userId: user.userId
    });
  }
  try {
    const { tryGrantWelcomeSignupBonus } = require('../wallet/grantWelcomeSignupBonus.service');
    welcomeBonusGrant = await tryGrantWelcomeSignupBonus(user.userId, {
      clientStoreCode: resolvedClientStoreCode
    });
  } catch (welcomeErr) {
    logger.warn('[register] Welcome signup bonus failed', { message: welcomeErr.message, userId: user.userId });
  }

  const signupBonusMeta = {
    ...(guestSpinClaim?.claimed && {
      guest_spin_claimed: true,
      guest_spin_amount_sc: guestSpinClaim.amount_sc
    }),
    ...(welcomeBonusGrant?.granted && {
      welcome_bonus_granted: true,
      welcome_bonus_amount_sc: welcomeBonusGrant.amount_sc
    }),
    ...(referralFriendBonusGrant?.granted && {
      referral_friend_bonus_granted: true,
      referral_friend_bonus_amount_sc: referralFriendBonusGrant.amount_sc
    })
  };

  if (useEmailVerification) {
    const emailToken = jwt.sign(
      { userId: user.userId },
      emailTokenKey,
      { expiresIn: emailTokenExpiry }
    );
    const { getResolvedUserSiteBaseUrl } = require('../store/userSiteUrl.service');
    const storeCodeForUrl = trimmedOrNull(body.clientStoreCode) || trimmedOrNull(body.storeCode) || user.storeCode;
    const base = await getResolvedUserSiteBaseUrl(storeCodeForUrl);
    const verifyLink = `${base}/check-email?emailToken=${encodeURIComponent(emailToken)}`;
    await user.update({
      emailVerificationToken: emailToken,
      emailVerificationTokenExpiresAt: null
    });
    let emailSent = true;
    try {
      await sendVerificationEmailWithLink(user.email, verifyLink, undefined, { storeCode: storeCodeForUrl });
    } catch (emailErr) {
      emailSent = false;
      logger.warn('Verification email send failed (signup still completed):', emailErr.message);
    }
    return {
      status: 'PENDING_VERIFICATION',
      message: emailSent
        ? 'Please check your email to verify your account.'
        : 'Signup completed. We could not send the verification email; please try again later from your profile.',
      email: user.email,
      emailSent,
      ...signupBonusMeta
    };
  }

  const token = createAccessToken(user);
  return {
    user: toSafeUser(user),
    token,
    ...signupBonusMeta
  };
}

module.exports = { register };
