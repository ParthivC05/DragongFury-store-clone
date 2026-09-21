'use strict';

const db = require('../db/models');
const { isAdminPanelAccount, isStoreAdmin, isMasterAdmin, isDistributorAdmin } = require('../constants/roles');
const { encryptPassword, validatePasswordStrength, comparePassword } = require('../utils/common');
const {
  generatePasswordResetToken,
  getPasswordResetExpiry,
  sendAdminPasswordResetEmail,
  sendOtpVerificationEmail,
  getOtpExpiry
} = require('../utils/email');
const { createAccessToken } = require('../helpers/authentication.helpers');
const { assertAdminMatchesLoginScope, normalizeStoreCode } = require('./auth/adminHostBinding.helpers');
const { assertStoreStaffLoginAllowed } = require('./staffAttendance/assertStaffLoginAllowed.service');

function toSafeUser(user) {
  const safe = user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.emailVerificationTokenExpiresAt;
  delete safe.passwordResetToken;
  delete safe.passwordResetTokenExpiresAt;
  return safe;
}

function ensureAdminUser(user) {
  if (!user) return null;
  if (isAdminPanelAccount(user.role, user.isAdmin)) return user;
  return null;
}

function normalizeStoreCodeFilter(storeCodeOpt) {
  return normalizeStoreCode(storeCodeOpt);
}

function activeAdminUsersFromRows(rows) {
  return rows.map((r) => ensureAdminUser(r)).filter(Boolean);
}

function filterAdminsByStore(admins, storeNorm, loginScope = null) {
  if (!storeNorm) return admins;
  // On a store admin domain, master/distributor may log in without matching that storeCode.
  if (loginScope?.kind === 'store' && loginScope.enforced) {
    return admins.filter(
      (u) =>
        isMasterAdmin(u.role) ||
        isDistributorAdmin(u.role) ||
        normalizeStoreCode(u.storeCode) === storeNorm
    );
  }
  return admins.filter((u) => normalizeStoreCode(u.storeCode) === storeNorm);
}

function filterAdminsByLoginScope(admins, loginScope) {
  if (!loginScope || !loginScope.enforced) return admins;
  if (loginScope.kind === 'platform') {
    return admins.filter((u) => !isStoreAdmin(u.role));
  }
  if (loginScope.kind === 'store') {
    return admins.filter(
      (u) => isStoreAdmin(u.role) || isMasterAdmin(u.role) || isDistributorAdmin(u.role)
    );
  }
  return admins;
}

/**
 * Same email may exist on many stores; partner logins use store scope. Admin login used findOne(email)
 * and could load a non-admin row. Resolve admin row(s) and pick by password; optional storeCode disambiguates.
 */
async function resolveAdminUserForPassword(emailNorm, password, storeCodeOpt, loginScope = null) {
  const rows = await db.User.findAll({ where: { email: emailNorm, isActive: true } });
  if (!rows.length) {
    const err = new Error('User not found.');
    err.statusCode = 401;
    throw err;
  }
  let admins = activeAdminUsersFromRows(rows);
  if (!admins.length) {
    const err = new Error('Admin access only. This account is not an administrator.');
    err.statusCode = 403;
    throw err;
  }
  const storeNorm = normalizeStoreCodeFilter(storeCodeOpt);
  admins = filterAdminsByStore(admins, storeNorm, loginScope);
  admins = filterAdminsByLoginScope(admins, loginScope);
  if (!admins.length) {
    if (loginScope?.kind === 'platform') {
      const err = new Error(
        'Wrong login page. Please open your store admin website and sign in there.'
      );
      err.statusCode = 403;
      err.code = 'ADMIN_HOST_STORE_ONLY';
      throw err;
    }
    if (loginScope?.kind === 'store') {
      const err = new Error(
        'Wrong login page. Please sign in at admin.dragonfury.com.'
      );
      err.statusCode = 403;
      err.code = 'ADMIN_HOST_PLATFORM_ONLY';
      throw err;
    }
    const err = new Error('No administrator account for this store with this email.');
    err.statusCode = 403;
    throw err;
  }
  const matches = [];
  for (const u of admins) {
    if (!u.password) continue;
    if (await comparePassword(password, u.password)) {
      matches.push(u);
    }
  }
  if (!matches.length) {
    const err = new Error('Password is incorrect.');
    err.statusCode = 401;
    throw err;
  }
  if (matches.length > 1) {
    const err = new Error(
      'Multiple administrator accounts share this email and password. Set ADMIN_STORE_CODE on the server or pass storeCode in the request body.'
    );
    err.statusCode = 400;
    err.code = 'ADMIN_LOGIN_AMBIGUOUS';
    throw err;
  }
  return matches[0];
}

async function adminForgotPassword(email, storeCodeOpt, loginScope = null) {
  const raw = email != null ? String(email).trim().toLowerCase() : '';
  if (!raw || raw.length < 3) {
    const err = new Error('Please enter a valid email address.');
    err.statusCode = 400;
    throw err;
  }

  const rows = await db.User.findAll({ where: { email: raw, isActive: true } });
  if (!rows.length) {
    const err = new Error('No account found with this email.');
    err.statusCode = 404;
    throw err;
  }
  let admins = activeAdminUsersFromRows(rows);
  if (!admins.length) {
    const err = new Error('This email is not registered as an admin. Use the main site for password reset.');
    err.statusCode = 403;
    throw err;
  }

  const storeNorm = normalizeStoreCodeFilter(storeCodeOpt);
  admins = filterAdminsByStore(admins, storeNorm, loginScope);
  admins = filterAdminsByLoginScope(admins, loginScope);
  if (!admins.length) {
    const err = new Error('No administrator account for this store with this email.');
    err.statusCode = 404;
    throw err;
  }
  if (admins.length > 1) {
    const err = new Error(
      'Several administrator accounts use this email. Pass storeCode (same as your store) so we know which account to reset.'
    );
    err.statusCode = 400;
    err.code = 'ADMIN_FORGOT_AMBIGUOUS';
    throw err;
  }

  const user = admins[0];
  assertAdminMatchesLoginScope(user, loginScope);

  const token = generatePasswordResetToken();
  const expiresAt = getPasswordResetExpiry();
  await user.update({
    passwordResetToken: token,
    passwordResetTokenExpiresAt: expiresAt
  });

  try {
    await sendAdminPasswordResetEmail(user.email, token, loginScope?.adminPanelBaseUrl || null);
  } catch (emailErr) {
    const err = new Error('Password reset service is not working for now. Please try again later.');
    err.statusCode = 503;
    err.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw err;
  }
  return { message: 'Password reset link has been sent to your email. Check your inbox.' };
}

async function adminResetPassword(token, newPassword) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Invalid reset link. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }
  if (!newPassword || typeof newPassword !== 'string') {
    const err = new Error('New password is required.');
    err.statusCode = 400;
    throw err;
  }
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) {
    const err = new Error(pwdCheck.error);
    err.statusCode = 400;
    throw err;
  }
  const trimmed = newPassword.trim();

  const user = await db.User.findOne({
    where: { passwordResetToken: token }
  });
  if (!user) {
    const err = new Error('Invalid or expired reset link. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }
  if (!ensureAdminUser(user)) {
    const err = new Error('This reset link is not for an admin account.');
    err.statusCode = 403;
    throw err;
  }
  const expiresAt = user.passwordResetTokenExpiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    await user.update({
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null
    });
    const err = new Error('This reset link has expired. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }

  const hashed = encryptPassword(trimmed);
  await user.update({
    password: hashed,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    passwordResetAt: new Date()
  });
  return { message: 'Your password has been reset. You can now sign in with your new password.' };
}

async function adminLoginStep1(email, password, storeCodeOpt, loginScope = null) {
  const raw = email != null ? String(email).trim().toLowerCase() : '';
  if (!raw || raw.length < 3) {
    const err = new Error('Please enter your email and password.');
    err.statusCode = 400;
    throw err;
  }
  if (!password || typeof password !== 'string') {
    const err = new Error('Please enter your email and password.');
    err.statusCode = 400;
    throw err;
  }

  const user = await resolveAdminUserForPassword(raw, password, storeCodeOpt, loginScope);
  assertAdminMatchesLoginScope(user, loginScope);
  await assertStoreStaffLoginAllowed(user);

  const PASSWORD_RESET_OTP_SKIP_MINUTES = 10;
  const resetAt = user.passwordResetAt ? new Date(user.passwordResetAt) : null;
  const skipOtpAfterReset =
    resetAt && Date.now() - resetAt.getTime() < PASSWORD_RESET_OTP_SKIP_MINUTES * 60 * 1000;

  if (skipOtpAfterReset) {
    if (user.isEmailVerified !== true) {
      await user.update({ isEmailVerified: true });
      await user.reload();
    }
    const accessToken = createAccessToken(user);
    return {
      token: accessToken,
      user: toSafeUser(user)
    };
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = getOtpExpiry();
  await user.update({
    emailVerificationToken: otp,
    emailVerificationTokenExpiresAt: expiresAt
  });
  try {
    await sendOtpVerificationEmail(user.email, otp);
  } catch (emailErr) {
    const err = new Error('We are facing some issue. Please try again later.');
    err.statusCode = emailErr.statusCode || 503;
    err.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw err;
  }
  return {
    requiresOtp: true,
    message: 'Verification code has been sent to your email.'
  };
}

/**
 * Invalidate stored login OTP for an email. Called when user clicks "Sign in with different email"
 * so the old OTP cannot be reused. Next login will generate and send a new OTP.
 */
async function adminInvalidateLoginOtp(email, storeCodeOpt, loginScope = null) {
  const raw = email != null ? String(email).trim().toLowerCase() : '';
  if (!raw || raw.length < 3) return;

  const rows = await db.User.findAll({ where: { email: raw, isActive: true } });
  let admins = activeAdminUsersFromRows(rows);
  const storeNorm = normalizeStoreCodeFilter(storeCodeOpt);
  admins = filterAdminsByStore(admins, storeNorm, loginScope);
  admins = filterAdminsByLoginScope(admins, loginScope);
  if (!admins.length) return;

  await Promise.all(
    admins.map((u) =>
      u.update({
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null
      })
    )
  );
}

/**
 * Resend login OTP to admin email. Used when user is on OTP step and needs a new code.
 * Does not require password; only email.
 */
async function adminResendLoginOtp(email, storeCodeOpt, loginScope = null) {
  const raw = email != null ? String(email).trim().toLowerCase() : '';
  if (!raw || raw.length < 3) {
    const err = new Error('Please enter a valid email address.');
    err.statusCode = 400;
    throw err;
  }

  const rows = await db.User.findAll({ where: { email: raw, isActive: true } });
  let admins = activeAdminUsersFromRows(rows);
  if (!admins.length) {
    const err = new Error('No account found with this email.');
    err.statusCode = 404;
    throw err;
  }
  const storeNorm = normalizeStoreCodeFilter(storeCodeOpt);
  admins = filterAdminsByStore(admins, storeNorm, loginScope);
  admins = filterAdminsByLoginScope(admins, loginScope);
  if (!admins.length) {
    const err = new Error('This email is not registered as an admin for this store.');
    err.statusCode = 403;
    throw err;
  }

  const pending = admins.filter((u) => u.emailVerificationToken);
  let user;
  if (pending.length === 1) {
    user = pending[0];
  } else if (pending.length > 1) {
    pending.sort(
      (a, b) =>
        new Date(b.emailVerificationTokenExpiresAt || 0) -
        new Date(a.emailVerificationTokenExpiresAt || 0)
    );
    user = pending[0];
  } else if (admins.length === 1) {
    user = admins[0];
  } else {
    const err = new Error(
      'Several administrator accounts use this email. Sign in with password again, or configure store code for this admin panel.'
    );
    err.statusCode = 400;
    err.code = 'ADMIN_OTP_RESEND_AMBIGUOUS';
    throw err;
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = getOtpExpiry();
  await user.update({
    emailVerificationToken: otp,
    emailVerificationTokenExpiresAt: expiresAt
  });
  try {
    await sendOtpVerificationEmail(user.email, otp);
  } catch (emailErr) {
    const err = new Error('We are facing some issue. Please try again later.');
    err.statusCode = emailErr.statusCode || 503;
    err.code = 'EMAIL_SERVICE_UNAVAILABLE';
    throw err;
  }
  return {
    message: 'A new verification code has been sent to your email.'
  };
}

async function adminVerifyLoginOtp(email, otp, storeCodeOpt, loginScope = null) {
  const raw = email != null ? String(email).trim().toLowerCase() : '';
  const otpStr = otp != null ? String(otp).trim() : '';
  if (!raw || raw.length < 3) {
    const err = new Error('Please enter a valid email address.');
    err.statusCode = 400;
    throw err;
  }
  if (!otpStr || otpStr.length !== 6) {
    const err = new Error('Please enter the 6-digit code from your email.');
    err.statusCode = 400;
    throw err;
  }

  const rows = await db.User.findAll({
    where: { email: raw, isActive: true, emailVerificationToken: otpStr }
  });
  let admins = activeAdminUsersFromRows(rows);
  if (!admins.length) {
    const err = new Error('Invalid verification code. Please check the code and try again.');
    err.statusCode = 400;
    throw err;
  }
  const storeNorm = normalizeStoreCodeFilter(storeCodeOpt);
  admins = filterAdminsByStore(admins, storeNorm, loginScope);
  admins = filterAdminsByLoginScope(admins, loginScope);
  if (!admins.length) {
    const err = new Error('Invalid verification code. Please check the code and try again.');
    err.statusCode = 400;
    throw err;
  }
  if (admins.length > 1) {
    const err = new Error(
      'Verification could not be completed. Configure store code for this admin panel or contact support.'
    );
    err.statusCode = 400;
    err.code = 'ADMIN_OTP_VERIFY_AMBIGUOUS';
    throw err;
  }

  const user = admins[0];
  assertAdminMatchesLoginScope(user, loginScope);
  await assertStoreStaffLoginAllowed(user);

  const expiresAt = user.emailVerificationTokenExpiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    await user.update({
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null
    });
    const err = new Error('This verification code has expired. Please sign in again and request a new code.');
    err.statusCode = 400;
    throw err;
  }

  await user.update({
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null
  });
  await user.reload();

  const accessToken = createAccessToken(user);
  return {
    token: accessToken,
    user: toSafeUser(user)
  };
}

/**
 * Change password for a logged-in admin. Validates current password; no email.
 * Available to distributor_admin and store_admin (and master_admin).
 */
async function adminChangePassword(userId, currentPassword, newPassword) {
  if (!userId) {
    const err = new Error('Unauthorized.');
    err.statusCode = 401;
    throw err;
  }
  if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
    const err = new Error('Current password is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!newPassword || typeof newPassword !== 'string') {
    const err = new Error('New password is required.');
    err.statusCode = 400;
    throw err;
  }
  const pwdCheck = validatePasswordStrength(newPassword.trim());
  if (!pwdCheck.valid) {
    const err = new Error(pwdCheck.error);
    err.statusCode = 400;
    throw err;
  }
  if (currentPassword.trim() === newPassword.trim()) {
    const err = new Error('New password must be different from current password.');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!ensureAdminUser(user)) {
    const err = new Error('Admin access only.');
    err.statusCode = 403;
    throw err;
  }
  if (!user.password) {
    const err = new Error('Cannot change password for this account.');
    err.statusCode = 400;
    throw err;
  }

  const match = await comparePassword(currentPassword.trim(), user.password);
  if (!match) {
    const err = new Error('Current password is incorrect.');
    err.statusCode = 400;
    throw err;
  }

  const hashed = encryptPassword(newPassword.trim());
  await user.update({ password: hashed });
  return { message: 'Your password has been updated. You can continue using the app.' };
}

module.exports = {
  adminForgotPassword,
  adminResetPassword,
  adminChangePassword,
  adminLoginStep1,
  adminInvalidateLoginOtp,
  adminResendLoginOtp,
  adminVerifyLoginOtp,
  resolveAdminUserForPassword
};
