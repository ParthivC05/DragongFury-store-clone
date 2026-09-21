const adminAuthService = require('../../services/adminAuth.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { logger } = require('../../libs/logger');
const { decodePasswordBody } = require('../../utils/passwordEncryption');
const { resolveAdminLoginScope } = require('../../services/auth/adminHostBinding.helpers');

function bodyStoreCode(body) {
  const fromBody = body && body.storeCode != null ? String(body.storeCode).trim() : '';
  return fromBody || undefined;
}

function resolveScope(req, body) {
  return resolveAdminLoginScope(req, bodyStoreCode(body), body);
}

function storeCodeFromScope(scope) {
  return scope?.storeCode || undefined;
}

async function login(req, res) {
  try {
    const body = decodePasswordBody(req.body || {});
    const { email, password } = body;
    const scope = resolveScope(req, body);
    const data = await adminAuthService.adminLoginStep1(
      email,
      password,
      storeCodeFromScope(scope),
      scope
    );
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Admin login error:', err.message || err);
    const status = err.statusCode || 500;
    let message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    if (err.code === 'EMAIL_SERVICE_UNAVAILABLE' || status === 503) {
      message = 'We are facing some issue. Please try again later.';
    }
    sendError(res, message, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function invalidateLoginOtp(req, res) {
  try {
    const body = req.body || {};
    const email = body.email;
    const scope = resolveScope(req, body);
    await adminAuthService.adminInvalidateLoginOtp(email, storeCodeFromScope(scope), scope);
    sendSuccess(res, {});
  } catch (err) {
    logger.error('Admin invalidate-login-otp error:', err.message || err);
    sendError(res, 'Request failed', 500);
  }
}

async function resendLoginOtp(req, res) {
  try {
    const body = req.body || {};
    const email = body.email;
    const scope = resolveScope(req, body);
    const data = await adminAuthService.adminResendLoginOtp(email, storeCodeFromScope(scope), scope);
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Admin resend-login-otp error:', err.message || err);
    const status = err.statusCode || 500;
    let message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    if (err.code === 'EMAIL_SERVICE_UNAVAILABLE' || status === 503) {
      message = 'We are facing some issue. Please try again later.';
    }
    sendError(res, message, status, err.code || null);
  }
}

async function verifyLoginOtp(req, res) {
  try {
    const body = req.body || {};
    const { email, otp } = body;
    const scope = resolveScope(req, body);
    const data = await adminAuthService.adminVerifyLoginOtp(
      email,
      otp,
      storeCodeFromScope(scope),
      scope
    );
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Admin verify-login-otp error:', err.message || err);
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function forgotPassword(req, res) {
  try {
    const body = req.body || {};
    const email = body.email;
    const scope = resolveScope(req, body);
    const data = await adminAuthService.adminForgotPassword(email, storeCodeFromScope(scope), scope);
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Admin forgot-password error:', err.message || err);
    const status = err.statusCode || 500;
    let message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    if (err.code === 'EMAIL_SERVICE_UNAVAILABLE' || status === 503 || status === 401) {
      message = 'Password reset service is not working for now. Please try again later.';
    }
    sendError(res, message, status);
  }
}

async function resetPassword(req, res) {
  try {
    const body = decodePasswordBody(req.body || {});
    const { token, newPassword } = body;
    const data = await adminAuthService.adminResetPassword(token, newPassword);
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Admin reset-password error:', err.message || err);
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function changePassword(req, res) {
  try {
    const userId = req.user && req.user.userId;
    const body = decodePasswordBody(req.body || {});
    const { currentPassword, newPassword } = body;
    const data = await adminAuthService.adminChangePassword(userId, currentPassword, newPassword);
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Admin change-password error:', err.message || err);
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

module.exports = {
  login,
  invalidateLoginOtp,
  resendLoginOtp,
  verifyLoginOtp,
  forgotPassword,
  resetPassword,
  changePassword
};
