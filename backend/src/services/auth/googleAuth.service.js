const { OAuth2Client } = require('google-auth-library');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { Op } = require('sequelize');
const { createAccessToken } = require('../../helpers/authentication.helpers');
const { isAdminPanelRole } = require('../../constants/roles');
const crypto = require('crypto');

/** User-friendly message when sign-in is not allowed here (e.g. admin on user panel). */
const INVALID_CREDENTIALS_MESSAGE = 'We couldn\'t sign you in with this account. Please try again or use a different sign-in method.';

const clientId = config.get('google.clientId');

// Production security: token and profile limits to prevent abuse
const MAX_ID_TOKEN_LENGTH = 8192;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 255;
const MAX_PROFILE_IMAGE_URL_LENGTH = 2048;
const GOOGLE_SUB_MAX_LENGTH = 64;
const SAFE_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function sanitizeString(str, maxLen) {
  if (str == null || typeof str !== 'string') return null;
  const t = str.trim().slice(0, maxLen);
  return t || null;
}

function generateReferralCode() {
  return crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || `R${Date.now().toString(36).toUpperCase()}`;
}

async function toSafeUser(user) {
  const safe = user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.paymentApiPasswordEncrypted;
  delete safe.signupBonusCodeId;
  try {
    const { phoneStatusForUser } = require('../phone/phoneOtp.service');
    const phoneStatus = await phoneStatusForUser(safe);
    safe.isPhoneVerified = Boolean(safe.isPhoneVerified);
    safe.phoneVerificationRequired = phoneStatus.needsVerification;
    safe.phoneVerification = phoneStatus;
  } catch (_) {
    /* ignore */
  }
  return safe;
}

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function findOrCreateUserByGoogle(profile, options = {}) {
  const sub = profile && profile.sub;
  if (!sub || typeof sub !== 'string') {
    const err = new Error('Invalid Google profile.');
    err.statusCode = 401;
    throw err;
  }
  const googleId = String(sub).trim().slice(0, GOOGLE_SUB_MAX_LENGTH);
  if (!googleId) {
    const err = new Error('Invalid Google profile.');
    err.statusCode = 401;
    throw err;
  }
  const rawEmail = profile.email;
  const email = (rawEmail && String(rawEmail).toLowerCase().trim().slice(0, MAX_EMAIL_LENGTH)) || null;
  if (!email) {
    const err = new Error('Google account did not provide an email.');
    err.statusCode = 400;
    throw err;
  }
  if (!SAFE_EMAIL_REGEX.test(email)) {
    const err = new Error('Invalid email from Google.');
    err.statusCode = 400;
    throw err;
  }
  const firstName = sanitizeString(profile.given_name, MAX_NAME_LENGTH);
  const lastName = sanitizeString(profile.family_name, MAX_NAME_LENGTH);
  let resolvedFirstName = firstName;
  let resolvedLastName = lastName;
  if (!resolvedFirstName && !resolvedLastName && profile.name && typeof profile.name === 'string') {
    const nameParts = profile.name.trim().split(/\s+/).filter(Boolean);
    if (nameParts.length) {
      resolvedFirstName = sanitizeString(nameParts[0], MAX_NAME_LENGTH);
      resolvedLastName = nameParts.length > 1
        ? sanitizeString(nameParts.slice(1).join(' '), MAX_NAME_LENGTH)
        : null;
    }
  }
  const profileImageUrl = (profile.picture && typeof profile.picture === 'string')
    ? profile.picture.trim().slice(0, MAX_PROFILE_IMAGE_URL_LENGTH)
    : null;

  // Per-store: resolve store from clientStoreCode
  let storeCode = null;
  let distributorCode = null;
  if (options.clientStoreCode) {
    const { resolveStoreFromCode } = require('./storeBinding.helpers');
    const { isBonusPlaythroughStore } = require('../wallet/bonusPlaythrough.constants');
    const clientCode = normalizeStoreCode(options.clientStoreCode);
    const resolved = await resolveStoreFromCode(clientCode);
    if (resolved) {
      storeCode = resolved.storeCode;
      distributorCode = resolved.distributorCode;
    } else if (isBonusPlaythroughStore(clientCode)) {
      storeCode = clientCode;
    } else {
      const err = new Error('This sign-in page is not available. Please contact support.');
      err.statusCode = 400;
      err.code = 'INVALID_STORE';
      throw err;
    }
  }

  // Existing Google account for this store — login only; never grant welcome bonus again.
  const googleWhere = storeCode ? { googleId, storeCode } : { googleId };
  let user = await db.User.findOne({ where: googleWhere, include: [] });
  if (user) return { user, guestSpinClaim: null, welcomeBonusGrant: null, referralFriendBonusGrant: null };

  // Link Google to an existing email account for this store — still login/link only, no welcome bonus.
  const emailWhere = storeCode ? { email, storeCode } : { email };
  user = await db.User.findOne({ where: emailWhere, include: [] });
  if (user) {
    await user.update({
      googleId,
      signInType: 'GOOGLE',
      isEmailVerified: true,
      ...(profileImageUrl && { profileImageUrl }),
      ...(resolvedFirstName && { firstName: String(resolvedFirstName).trim() || null }),
      ...(resolvedLastName && { lastName: String(resolvedLastName).trim() || null })
    });
    return { user: await user.reload(), guestSpinClaim: null, welcomeBonusGrant: null, referralFriendBonusGrant: null };
  }

  const username = email.split('@')[0] || `user_${Date.now()}`;
  let finalUsername = username;
  let suffix = 1;
  const usernameWhere = (un) => {
    const base = db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, (un || finalUsername).toLowerCase());
    return storeCode ? { [Op.and]: [base, { storeCode }] } : { [Op.and]: [base, db.sequelize.where(db.sequelize.col('store_code'), Op.is, null)] };
  };
  while (await db.User.findOne({ where: usernameWhere(finalUsername) })) {
    finalUsername = `${username}${suffix}`;
    suffix += 1;
  }

  let userReferralCode = generateReferralCode();
  while (await db.User.findOne({ where: { userReferralCode }, attributes: ['userId'] })) {
    userReferralCode = generateReferralCode();
  }

  let signupBonusCodeId;
  const bonusRaw =
    (options.bonusCode != null && String(options.bonusCode).trim()) ||
    (options.bc != null && String(options.bc).trim()) ||
    '';
  if (bonusRaw) {
    if (!storeCode) {
      const err = new Error('A store is required to use a bonus code.');
      err.statusCode = 400;
      err.code = 'INVALID_BONUS_CODE';
      throw err;
    }
    const { resolveSignupBonusCodeForRegister } = require('../bonusCodes/resolveSignupBonusCodeForRegister.service');
    signupBonusCodeId = await resolveSignupBonusCodeForRegister(bonusRaw, storeCode);
  }

  const { resolveOptionalReferralForOauth, pickReferralFromOptions } = require('./oauthReferral.helpers');
  const referralResolved = await resolveOptionalReferralForOauth(pickReferralFromOptions(options));
  const referredByUserId = referralResolved.referredByUserId;
  if (!storeCode && referralResolved.storeCode) {
    storeCode = referralResolved.storeCode;
    distributorCode = distributorCode || referralResolved.distributorCode;
  }

  const { enforceSignupDevicePolicy } = require('./fingerprintSignup.service');
  const deviceVisitorId = await enforceSignupDevicePolicy({
    fingerprintRequestId: options.fingerprintRequestId,
    storeCode,
    clientIps: options.clientIps
  });

  let newUser;
  try {
    newUser = await db.User.create({
      email,
      username: finalUsername,
      firstName: resolvedFirstName || null,
      lastName: resolvedLastName || null,
      profileImageUrl: profileImageUrl || null,
      googleId,
      signInType: 'GOOGLE',
      isEmailVerified: true,
      userReferralCode,
      password: null,
      ...(referredByUserId && { userReferredBy: referredByUserId }),
      ...(storeCode && { storeCode, distributorCode: distributorCode || undefined }),
      ...(signupBonusCodeId != null && { signupBonusCodeId }),
      ...(deviceVisitorId && { deviceVisitorId })
    });
  } catch (createErr) {
    const parent = createErr.parent || createErr.original;
    const constraint = createErr.constraint || parent?.constraint;
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

  const { ensureUserWalletSet } = require('../wallet/walletBuckets.service');
  await ensureUserWalletSet(newUser.userId);

  // Create Orionstars Pay / CentryOS payment account for new Google sign-up (same as register flow)
  const payment = require('../payment');
  const { paymentLog } = require('../../libs/logger');
  const logger = require('../../libs/logger').logger;
  const { generatePaymentPassword, encryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
  const trimmedFirst = (resolvedFirstName && String(resolvedFirstName).trim()) || '';
  const trimmedLast = (resolvedLastName && String(resolvedLastName).trim()) || '';

  if (payment.isPaymentConfigured() && isPaymentPasswordEncryptionConfigured() && trimmedFirst && trimmedLast) {
    const paymentPassword = generatePaymentPassword();
    const paymentUser = newUser;
    setImmediate(() => {
      (async () => {
        paymentLog('--- Google signup: creating Payment API account (CentryOS/Orionstars Pay) ---');
        try {
          await payment.signupUserDirect({
            firstName: trimmedFirst,
            lastName: trimmedLast,
            email,
            password: paymentPassword,
            partnerCode: options.paymentPartnerCode
          });
          const encrypted = encryptPaymentPassword(paymentPassword);
          if (encrypted) {
            await paymentUser.update({
              paymentApiPasswordEncrypted: encrypted,
              paymentApiEmail: email,
              paymentAccountCreatedByPlatform: true
            });
          }
          paymentLog('Google signup: Payment account created for new user.');
          if (db.Notification) {
            await db.Notification.create({
              userId: paymentUser.userId,
              type: 'payment_account_created',
              title: 'Payment account set up',
              message: 'Your payment account is ready. View your login details on the Payment Account page.',
              actionUrl: '/account/profile'
            });
          }
        } catch (paymentErr) {
          const statusCode = paymentErr.statusCode ?? paymentErr.response?.status;
          const responseBody = paymentErr.response;
          const rawMsg =
            (responseBody && typeof responseBody === 'object' && (responseBody.message || responseBody.error || responseBody.msg)) ||
            (typeof responseBody === 'string' ? responseBody : null) ||
            paymentErr.message ||
            '';
          const msg = String(rawMsg).toLowerCase();
          paymentLog('Google signup: Payment API create failed.', statusCode, paymentErr.message);
          logger.warn('[Google signup] Payment API signup failed', {
            statusCode,
            message: paymentErr.message,
            email
          });
          const explicitlyAlreadyExists =
            msg.includes('already exists') ||
            msg.includes('user already exists') ||
            msg.includes('email already exists') ||
            msg.includes('already registered') ||
            msg.includes('account already exists');
          if (explicitlyAlreadyExists && db.Notification) {
            await db.Notification.create({
              userId: paymentUser.userId,
              type: 'payment_account_link_required',
              title: 'Link your payment account',
              message: 'A payment account already exists for this email. Link it on the Payment Account page to start depositing.',
              actionUrl: '/account/profile'
            });
          }
        }
      })();
    });
  }

  let guestSpinClaim = null;
  try {
    const { claimGuestLandingSpinFromBody } = require('../spinWheel/claimGuestLandingSpin.service');
    guestSpinClaim = await claimGuestLandingSpinFromBody(newUser.userId, options);
  } catch (claimErr) {
    logger.warn('[Google signup] Guest landing spin claim failed', { message: claimErr.message, userId: newUser.userId });
  }

  let welcomeBonusGrant = null;
  let referralFriendBonusGrant = null;
  try {
    const { tryGrantReferralFriendSignupBonus } = require('../affiliate/grantReferralFriendSignupBonus.service');
    referralFriendBonusGrant = await tryGrantReferralFriendSignupBonus(newUser.userId, {
      clientStoreCode: normalizeStoreCode(options.clientStoreCode || storeCode || '')
    });
  } catch (refBonusErr) {
    logger.warn('[Google signup] Referral friend signup bonus failed', {
      message: refBonusErr.message,
      userId: newUser.userId
    });
  }
  try {
    const { tryGrantWelcomeSignupBonus } = require('../wallet/grantWelcomeSignupBonus.service');
    welcomeBonusGrant = await tryGrantWelcomeSignupBonus(newUser.userId, {
      clientStoreCode: normalizeStoreCode(options.clientStoreCode || storeCode || '')
    });
  } catch (welcomeErr) {
    logger.warn('[Google signup] Welcome signup bonus failed', { message: welcomeErr.message, userId: newUser.userId });
  }

  return { user: newUser, guestSpinClaim, welcomeBonusGrant, referralFriendBonusGrant };
}

async function loginWithGoogle(idToken, options = {}) {
  if (!clientId) {
    const err = new Error('Google Sign-In is not configured.');
    err.statusCode = 503;
    throw err;
  }
  if (!idToken || typeof idToken !== 'string') {
    const err = new Error('Google id token is required.');
    err.statusCode = 400;
    throw err;
  }
  const trimmedToken = idToken.trim();
  if (trimmedToken.length > MAX_ID_TOKEN_LENGTH) {
    const err = new Error('Invalid Google token.');
    err.statusCode = 400;
    throw err;
  }

  const client = new OAuth2Client(clientId);
  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken: trimmedToken, audience: clientId });
  } catch (e) {
    const err = new Error('Invalid or expired Google token. Please try again.');
    err.statusCode = 401;
    throw err;
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    const err = new Error('Invalid Google token payload.');
    err.statusCode = 401;
    throw err;
  }

  let { user, guestSpinClaim, welcomeBonusGrant, referralFriendBonusGrant } = await findOrCreateUserByGoogle(payload, {
    clientStoreCode: options.clientStoreCode,
    bonusCode: options.bonusCode,
    bc: options.bc,
    ref: options.ref,
    affiliateCode: options.affiliateCode,
    paymentPartnerCode: options.paymentPartnerCode,
    guestSpinWonAt: options.guestSpinWonAt,
    guestSpinAmountSc: options.guestSpinAmountSc,
    fingerprintRequestId: options.fingerprintRequestId,
    clientIps: options.clientIps
  });
  if (!user.isActive) {
    const err = new Error('Your account is inactive. Please contact support.');
    err.statusCode = 403;
    throw err;
  }
  if (isAdminPanelRole(user.role)) {
    const err = new Error(INVALID_CREDENTIALS_MESSAGE);
    err.statusCode = 401;
    throw err;
  }
  if (options.clientStoreCode) {
    const { ensureUserStoreMatchesOrBind } = require('./storeBinding.helpers');
    user = await ensureUserStoreMatchesOrBind(user, options.clientStoreCode);
  }

  // Handle bonus code update on Google login for existing users
  const rawBonus = (options.bonusCode != null && typeof options.bonusCode === 'string' && options.bonusCode.trim()) ||
                   (options.bc != null && typeof options.bc === 'string' && options.bc.trim()) ||
                   '';
  if (rawBonus && user.storeCode) {
    try {
      const { resolveSignupBonusCodeForRegister } = require('../bonusCodes/resolveSignupBonusCodeForRegister.service');
      const bonusCodeId = await resolveSignupBonusCodeForRegister(rawBonus, user.storeCode);
      if (bonusCodeId && user.signupBonusCodeId !== bonusCodeId) {
        await user.update({ signupBonusCodeId: bonusCodeId });
      }
    } catch (bonusErr) {
      // Log bonus code error but don't fail the login
      const logger = require('../../libs/logger').logger;
      logger.warn('Bonus code validation failed during Google login:', bonusErr.message);
    }
  }

  // Issue session without phone OTP; purchase flows require verified phone via Settings.
  const token = createAccessToken(user);
  return {
    user: await toSafeUser(user),
    token,
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
}

async function loginWithGoogleAuthCode(code, redirectUri, options = {}) {
  const clientSecret = config.get('google.clientSecret');
  if (!clientId) {
    const err = new Error('Google Sign-In is not configured.');
    err.statusCode = 503;
    throw err;
  }
  if (!clientSecret) {
    const err = new Error('Google redirect sign-in is not configured.');
    err.statusCode = 503;
    throw err;
  }
  if (!code || typeof code !== 'string') {
    const err = new Error('Google authorization code is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!redirectUri || typeof redirectUri !== 'string') {
    const err = new Error('Google redirect URI is required.');
    err.statusCode = 400;
    throw err;
  }

  const trimmedCode = code.trim();
  const trimmedRedirectUri = redirectUri.trim();
  if (!trimmedCode || trimmedCode.length > 2048) {
    const err = new Error('Invalid Google authorization code.');
    err.statusCode = 400;
    throw err;
  }
  if (!trimmedRedirectUri || trimmedRedirectUri.length > 2048) {
    const err = new Error('Invalid Google redirect URI.');
    err.statusCode = 400;
    throw err;
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret, trimmedRedirectUri);
  let tokens;
  try {
    const result = await oauth2Client.getToken(trimmedCode);
    tokens = result.tokens;
  } catch (e) {
    const err = new Error('Invalid or expired Google sign-in. Please try again.');
    err.statusCode = 401;
    throw err;
  }

  const idToken = tokens && tokens.id_token;
  if (!idToken || typeof idToken !== 'string') {
    const err = new Error('Google did not return a sign-in token. Please try again.');
    err.statusCode = 401;
    throw err;
  }

  return loginWithGoogle(idToken, options);
}

module.exports = { loginWithGoogle, loginWithGoogleAuthCode };
