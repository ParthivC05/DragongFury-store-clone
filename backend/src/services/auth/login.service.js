const db = require('../../db/models');
const { comparePassword } = require('../../utils/common');
const { createAccessToken } = require('../../helpers/authentication.helpers');
const { isAdminPanelRole } = require('../../constants/roles');
const { ensureUserStoreMatchesOrBind, normalizeStoreCode, resolveStoreFromCode } = require('./storeBinding.helpers');
const { resolveSignupBonusCodeForRegister } = require('../bonusCodes/resolveSignupBonusCodeForRegister.service');
const { normalizePhoneE164 } = require('../phone/phoneOtp.service');

/** User-friendly message when credentials are wrong or account cannot sign in here (e.g. admin on user panel). */
const INVALID_CREDENTIALS_MESSAGE = 'We couldn\'t sign you in. Please check your details and try again.';

async function toSafeUser(user) {
  const safe = user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.paymentApiPasswordEncrypted;
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

function trimmedOrNull(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s || null;
}

function looksLikeEmail(value) {
  return String(value || '').includes('@');
}

async function findUserForLogin(identifier, storeCode) {
  const base = { isActive: true };
  if (storeCode) base.storeCode = storeCode;

  if (looksLikeEmail(identifier)) {
    const emailNorm = String(identifier).toLowerCase().trim();
    return db.User.findOne({ where: { ...base, email: emailNorm } });
  }

  const phone = normalizePhoneE164(identifier);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    const err = new Error('Enter a valid email address or US phone number.');
    err.statusCode = 400;
    err.code = 'INVALID_LOGIN_IDENTIFIER';
    throw err;
  }

  // Prefer verified phone match in this store
  let user = await db.User.findOne({
    where: { ...base, phone, isPhoneVerified: true }
  });
  if (!user) {
    user = await db.User.findOne({ where: { ...base, phone } });
  }
  return user;
}

async function login(body) {
  const identifierRaw = body?.email ?? body?.identifier ?? body?.phone;
  const { password, clientStoreCode } = body || {};
  if (!identifierRaw || !password) {
    const err = new Error('Please enter your email or phone number and password.');
    err.statusCode = 400;
    throw err;
  }
  const identifier = String(identifierRaw).trim();

  let storeCode = null;
  if (clientStoreCode) {
    const clientNorm = normalizeStoreCode(clientStoreCode);
    const resolved = await resolveStoreFromCode(clientNorm);
    if (!resolved) {
      const err = new Error('This sign-in page is not available. Please contact support.');
      err.statusCode = 400;
      err.code = 'INVALID_STORE';
      throw err;
    }
    storeCode = resolved.storeCode;
  }

  const user = await findUserForLogin(identifier, storeCode);
  if (!user) {
    const err = new Error(
      looksLikeEmail(identifier)
        ? 'No account found with this email. Please sign up first, then log in.'
        : 'No account found with this phone number. Please sign up first, then log in.'
    );
    err.statusCode = 401;
    err.code = 'ACCOUNT_NOT_FOUND';
    throw err;
  }
  if (isAdminPanelRole(user.role)) {
    const err = new Error(INVALID_CREDENTIALS_MESSAGE);
    err.statusCode = 401;
    throw err;
  }
  if (!user.password) {
    const err = new Error(
      user.signInType === 'GOOGLE'
        ? 'This account uses Google sign-in. Please use the "Continue with Google" button.'
        : user.signInType === 'FACEBOOK'
          ? 'This account uses Facebook sign-in. Please use the "Continue with Facebook" button.'
          : "We couldn't sign you in. Please check your details and try again."
    );
    err.statusCode = 401;
    err.code = 'USE_OAUTH';
    throw err;
  }
  const match = await comparePassword(password, user.password);
  if (!match) {
    const err = new Error(INVALID_CREDENTIALS_MESSAGE);
    err.statusCode = 401;
    throw err;
  }
  let sessionUser = user;
  if (body.clientStoreCode) {
    try {
      sessionUser = await ensureUserStoreMatchesOrBind(user, body.clientStoreCode);
    } catch (e) {
      if (e.code === 'WRONG_STORE') {
        e.message =
          'These sign-in details are not for this website. If your account is with another store, open that store’s site—or double-check your email/phone and password.';
        e.statusCode = 401;
      }
      throw e;
    }
  }

  const rawBonus = trimmedOrNull(body.bonusCode) || trimmedOrNull(body.bc);
  if (rawBonus && sessionUser.storeCode) {
    try {
      const bonusCodeId = await resolveSignupBonusCodeForRegister(rawBonus, sessionUser.storeCode);
      if (bonusCodeId && sessionUser.signupBonusCodeId !== bonusCodeId) {
        await sessionUser.update({ signupBonusCodeId: bonusCodeId });
      }
    } catch (bonusErr) {
      const logger = require('../../libs/logger').logger;
      logger.warn('Bonus code validation failed during login:', bonusErr.message);
    }
  }

  if (!sessionUser.isEmailVerified) {
    const err = new Error(
      'Your email address has not been verified. Please check your inbox for the verification link or request a new one.'
    );
    err.statusCode = 403;
    err.code = 'EMAIL_VERIFICATION_PENDING';
    throw err;
  }

  // Allow login without phone OTP. Phone is enforced at purchase via Settings.
  const token = createAccessToken(sessionUser);
  return { user: await toSafeUser(sessionUser), token };
}

module.exports = { login };
