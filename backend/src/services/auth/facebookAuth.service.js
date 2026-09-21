const axios = require('axios');
const db = require('../../db/models');
const config = require('../../configs/app.config');
const { Op } = require('sequelize');
const { createAccessToken } = require('../../helpers/authentication.helpers');
const { isAdminPanelRole } = require('../../constants/roles');
const crypto = require('crypto');

/** User-friendly message when sign-in is not allowed here (e.g. admin on user panel). */
const INVALID_CREDENTIALS_MESSAGE = 'We couldn\'t sign you in with this account. Please try again or use a different sign-in method.';

const appId = config.get('facebook.appId');
const appSecret = config.get('facebook.appSecret');
const isProduction = config.get('env') === 'production';

// Production security: token and profile limits
const MAX_ACCESS_TOKEN_LENGTH = 512;
const MAX_FACEBOOK_ID_LENGTH = 64;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 255;
const MAX_PROFILE_IMAGE_URL_LENGTH = 2048;
const SAFE_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const HTTP_TIMEOUT_MS = 10000;

function sanitizeString(str, maxLen) {
  if (str == null || typeof str !== 'string') return null;
  const t = str.trim().slice(0, maxLen);
  return t || null;
}

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
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

async function getFacebookProfile(accessToken) {
  const appAccessToken = appId && appSecret ? `${appId}|${appSecret}` : null;
  if (isProduction && (!appSecret || !appAccessToken)) {
    const err = new Error('Facebook Sign-In is not properly configured for production.');
    err.statusCode = 503;
    throw err;
  }
  const debugUrl = appAccessToken
    ? `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`
    : null;

  if (debugUrl) {
    try {
      const debugRes = await axios.get(debugUrl, { timeout: HTTP_TIMEOUT_MS });
      const data = debugRes.data && debugRes.data.data;
      if (!data || !data.is_valid) {
        const err = new Error('Invalid or expired Facebook token. Please try again.');
        err.statusCode = 401;
        throw err;
      }
      if (data.app_id !== appId) {
        const err = new Error('Invalid token.');
        err.statusCode = 401;
        throw err;
      }
    } catch (e) {
      if (e.statusCode) throw e;
      const err = new Error('Could not verify Facebook token.');
      err.statusCode = 401;
      throw err;
    }
  }

  const url = `https://graph.facebook.com/me?fields=id,email,name,first_name,last_name,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
  const profile = res.data;
  if (!profile || profile.id == null || profile.id === '') {
    const err = new Error('Invalid Facebook profile response.');
    err.statusCode = 401;
    throw err;
  }
  return profile;
}

async function findOrCreateUserByFacebook(profile, options = {}) {
  const rawId = profile.id;
  const facebookId = (rawId != null && String(rawId).trim()) ? String(rawId).trim().slice(0, MAX_FACEBOOK_ID_LENGTH) : null;
  if (!facebookId) {
    const err = new Error('Invalid Facebook profile.');
    err.statusCode = 401;
    throw err;
  }
  const rawEmail = profile.email;
  const email = (rawEmail && String(rawEmail).toLowerCase().trim().slice(0, MAX_EMAIL_LENGTH)) || null;
  if (email && !SAFE_EMAIL_REGEX.test(email)) {
    const err = new Error('Invalid email from Facebook.');
    err.statusCode = 400;
    throw err;
  }
  const firstName = sanitizeString(profile.first_name || (profile.name || '').split(/\s+/)[0], MAX_NAME_LENGTH);
  const lastName = sanitizeString(profile.last_name || (profile.name || '').split(/\s+/).slice(1).join(' '), MAX_NAME_LENGTH);
  const picUrl = profile.picture && profile.picture.data && profile.picture.data.url;
  const profileImageUrl = (typeof picUrl === 'string' && picUrl.trim()) ? picUrl.trim().slice(0, MAX_PROFILE_IMAGE_URL_LENGTH) : null;

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

  // Existing Facebook account for this store — login only; never grant welcome bonus again.
  const fbWhere = storeCode ? { facebookId, storeCode } : { facebookId };
  let user = await db.User.findOne({ where: fbWhere, include: [] });
  if (user) return { user, guestSpinClaim: null, welcomeBonusGrant: null, referralFriendBonusGrant: null };

  // Link Facebook to an existing email account for this store — still login/link only, no welcome bonus.
  if (email) {
    const emailWhere = storeCode ? { email, storeCode } : { email };
    user = await db.User.findOne({ where: emailWhere, include: [] });
    if (user) {
      await user.update({
        facebookId,
        signInType: 'FACEBOOK',
        isEmailVerified: true,
        ...(profileImageUrl && { profileImageUrl }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName })
      });
      return { user: await user.reload(), guestSpinClaim: null, welcomeBonusGrant: null, referralFriendBonusGrant: null };
    }
  }

  const username = email ? email.split('@')[0] : `fb_${facebookId}`;
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

  const newUser = await db.User.create({
    email: email || null,
    username: finalUsername,
    firstName: firstName || null,
    lastName: lastName || null,
    profileImageUrl: profileImageUrl || null,
    facebookId,
    signInType: 'FACEBOOK',
    isEmailVerified: !!email,
    userReferralCode,
    password: null,
    ...(referredByUserId && { userReferredBy: referredByUserId }),
    ...(storeCode && { storeCode, distributorCode: distributorCode || undefined }),
    ...(signupBonusCodeId != null && { signupBonusCodeId }),
    ...(deviceVisitorId && { deviceVisitorId })
  });

  const { ensureUserWalletSet } = require('../wallet/walletBuckets.service');
  await ensureUserWalletSet(newUser.userId);

  let guestSpinClaim = null;
  try {
    const { claimGuestLandingSpinFromBody } = require('../spinWheel/claimGuestLandingSpin.service');
    guestSpinClaim = await claimGuestLandingSpinFromBody(newUser.userId, options);
  } catch (claimErr) {
    const logger = require('../../libs/logger').logger;
    logger.warn('[Facebook signup] Guest landing spin claim failed', { message: claimErr.message, userId: newUser.userId });
  }

  let welcomeBonusGrant = null;
  let referralFriendBonusGrant = null;
  try {
    const { tryGrantReferralFriendSignupBonus } = require('../affiliate/grantReferralFriendSignupBonus.service');
    referralFriendBonusGrant = await tryGrantReferralFriendSignupBonus(newUser.userId, {
      clientStoreCode: normalizeStoreCode(options.clientStoreCode || storeCode || '')
    });
  } catch (refBonusErr) {
    const logger = require('../../libs/logger').logger;
    logger.warn('[Facebook signup] Referral friend signup bonus failed', {
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
    const logger = require('../../libs/logger').logger;
    logger.warn('[Facebook signup] Welcome signup bonus failed', { message: welcomeErr.message, userId: newUser.userId });
  }

  return { user: newUser, guestSpinClaim, welcomeBonusGrant, referralFriendBonusGrant };
}

async function loginWithFacebook(accessToken, options = {}) {
  if (!appId) {
    const err = new Error('Facebook Sign-In is not configured.');
    err.statusCode = 503;
    throw err;
  }
  if (!accessToken || typeof accessToken !== 'string') {
    const err = new Error('Facebook access token is required.');
    err.statusCode = 400;
    throw err;
  }
  const trimmedToken = accessToken.trim();
  if (trimmedToken.length > MAX_ACCESS_TOKEN_LENGTH) {
    const err = new Error('Invalid Facebook token.');
    err.statusCode = 400;
    throw err;
  }

  const profile = await getFacebookProfile(trimmedToken);
  let { user, guestSpinClaim, welcomeBonusGrant, referralFriendBonusGrant } = await findOrCreateUserByFacebook(profile, {
    clientStoreCode: options.clientStoreCode,
    bonusCode: options.bonusCode,
    bc: options.bc,
    ref: options.ref,
    affiliateCode: options.affiliateCode,
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

  // Handle bonus code update on Facebook login for existing users
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
      logger.warn('Bonus code validation failed during Facebook login:', bonusErr.message);
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

module.exports = { loginWithFacebook };
