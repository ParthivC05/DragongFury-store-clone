const authService = require('../../services/auth');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { logger } = require('../../libs/logger');
const { decodePasswordBody } = require('../../utils/passwordEncryption');
const { getPaymentPartnerCodeFromRequest } = require('../../services/payment/payment.config');
const config = require('../../configs/app.config');
const { createRefreshToken } = require('../../helpers/authentication.helpers');

const REFRESH_COOKIE_NAME = 'refreshToken';

function parseDurationToMs(value, fallbackMs) {
  if (!value || typeof value !== 'string') return fallbackMs;
  const m = value.trim().toLowerCase().match(/^(\d+)\s*(ms|s|m|h|d)?$/);
  if (!m) return fallbackMs;
  const amount = Number(m[1]);
  const unit = m[2] || 'ms';
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  const factors = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return amount * (factors[unit] || 1);
}

function refreshCookieOptions() {
  const isProduction = config.get('env') === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: parseDurationToMs(config.get('jwt.refreshTokenExpiry'), 30 * 24 * 60 * 60 * 1000),
    path: '/'
  };
}

function extractCookie(req, name) {
  const raw = req && req.headers ? req.headers.cookie : '';
  if (!raw || typeof raw !== 'string') return '';
  const items = raw.split(';');
  for (const item of items) {
    const [k, ...rest] = item.split('=');
    if ((k || '').trim() === name) return decodeURIComponent(rest.join('=').trim());
  }
  return '';
}

function setRefreshTokenCookie(res, user) {
  const refreshToken = createRefreshToken(user);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
}

async function register(req, res) {
  try {
    const body = decodePasswordBody(req.body);
    const { assertClientStoreMatchesRequestOrigin } = require('../../services/auth/storeBinding.helpers');
    const { collectSignupClientIps } = require('../../services/auth/fingerprintSignup.service');
    const clientStoreCode = body?.clientStoreCode ?? body?.storeCode;
    if (clientStoreCode) {
      await assertClientStoreMatchesRequestOrigin(clientStoreCode, req);
    }
    const data = await authService.register(body, {
      paymentPartnerCode: getPaymentPartnerCodeFromRequest(req),
      clientIps: collectSignupClientIps(req)
    });
    if (data && data.token && data.user && data.user.userId) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, data, 201);
  } catch (err) {
    logger.error('Register error: ' + (err && err.message ? err.message : String(err)));
    if (err && err.stack) logger.error(err.stack);
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function login(req, res) {
  try {
    const body = decodePasswordBody(req.body);
    const data = await authService.login(body);
    if (data && data.token && data.user && data.user.userId) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Login error:', err.message || err);
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function getMe(req, res) {
  try {
    const data = await authService.getMe(req.user.userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null);
  }
}

async function sendVerificationEmail(req, res) {
  try {
    const storeCode = (req.body && (req.body.storeCode || req.body.clientStoreCode)) || null;
    const data = await authService.sendVerificationEmailService(req.user.userId, { storeCode });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function verifyEmail(req, res) {
  try {
    const emailToken = (req.query && (req.query.emailToken || req.query.token)) || '';
    const data = await authService.verifyEmail(emailToken);
    if (data && data.user && data.user.userId && data.token) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function forgotPassword(req, res) {
  try {
    const email = req.body && req.body.email;
    const storeCode = (req.body && (req.body.storeCode || req.body.clientStoreCode)) || null;
    const data = await authService.forgotPassword(email, { storeCode });
    sendSuccess(res, data);
  } catch (err) {
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
    const data = await authService.resetPassword(token, newPassword);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    let message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    if (status >= 500) {
      message = 'Something went wrong. Please try again later or request a new reset link.';
    }
    sendError(res, message, status);
  }
}

async function refreshEmailToken(req, res) {
  try {
    const email = (req.body && req.body.email) || (req.query && req.query.email) || '';
    const storeCode = (req.body && (req.body.storeCode || req.body.clientStoreCode)) || (req.query && (req.query.storeCode || req.query.clientStoreCode)) || null;
    const data = await authService.refreshEmailToken(email, { storeCode });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function googleLogin(req, res) {
  try {
    const idToken = (req.body && req.body.idToken) || (req.body && req.body.id_token) || '';
    const clientStoreCode = req.body && req.body.clientStoreCode;
    const { assertClientStoreMatchesRequestOrigin } = require('../../services/auth/storeBinding.helpers');
    const { collectSignupClientIps } = require('../../services/auth/fingerprintSignup.service');
    if (clientStoreCode) {
      await assertClientStoreMatchesRequestOrigin(clientStoreCode, req);
    }
    const bonusCode = req.body && req.body.bonusCode;
    const bc = req.body && req.body.bc;
    const data = await authService.loginWithGoogle(idToken, {
      clientStoreCode,
      bonusCode,
      bc,
      ref: req.body && (req.body.ref || req.body.affiliateCode),
      affiliateCode: req.body && req.body.affiliateCode,
      paymentPartnerCode: getPaymentPartnerCodeFromRequest(req),
      guestSpinWonAt: req.body && req.body.guestSpinWonAt,
      guestSpinAmountSc: req.body && req.body.guestSpinAmountSc,
      fingerprintRequestId: req.body && req.body.fingerprintRequestId,
      clientIps: collectSignupClientIps(req)
    });
    if (data && data.token && data.user && data.user.userId) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, data);
  } catch (err) {
    // Never log tokens. Log only error type and status for security.
    logger.error('Google login failed', { statusCode: err.statusCode || 500, message: err.message });
    const status = err.statusCode || 500;
    const clientMessage =
      status === 401 || status === 400 || status === 403
        ? (typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Invalid or expired Google sign-in. Please try again.')
        : 'Sign-in failed. Please try again later.';
    sendError(res, clientMessage, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function googleLoginWithCode(req, res) {
  try {
    const code = (req.body && req.body.code) || '';
    const redirectUri = (req.body && req.body.redirectUri) || (req.body && req.body.redirect_uri) || '';
    const clientStoreCode = req.body && req.body.clientStoreCode;
    const { assertClientStoreMatchesRequestOrigin } = require('../../services/auth/storeBinding.helpers');
    const { collectSignupClientIps } = require('../../services/auth/fingerprintSignup.service');
    if (clientStoreCode) {
      await assertClientStoreMatchesRequestOrigin(clientStoreCode, req);
    }
    const bonusCode = req.body && req.body.bonusCode;
    const bc = req.body && req.body.bc;
    const data = await authService.loginWithGoogleAuthCode(code, redirectUri, {
      clientStoreCode,
      bonusCode,
      bc,
      ref: req.body && (req.body.ref || req.body.affiliateCode),
      affiliateCode: req.body && req.body.affiliateCode,
      paymentPartnerCode: getPaymentPartnerCodeFromRequest(req),
      guestSpinWonAt: req.body && req.body.guestSpinWonAt,
      guestSpinAmountSc: req.body && req.body.guestSpinAmountSc,
      fingerprintRequestId: req.body && req.body.fingerprintRequestId,
      clientIps: collectSignupClientIps(req)
    });
    if (data && data.token && data.user && data.user.userId) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, data);
  } catch (err) {
    logger.error('Google redirect login failed', { statusCode: err.statusCode || 500, message: err.message });
    const status = err.statusCode || 500;
    const clientMessage =
      status === 401 || status === 400 || status === 403
        ? (typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Invalid or expired Google sign-in. Please try again.')
        : 'Sign-in failed. Please try again later.';
    sendError(res, clientMessage, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function facebookLogin(req, res) {
  try {
    const accessToken = (req.body && req.body.accessToken) || (req.body && req.body.access_token) || '';
    const clientStoreCode = req.body && req.body.clientStoreCode;
    const { assertClientStoreMatchesRequestOrigin } = require('../../services/auth/storeBinding.helpers');
    const { collectSignupClientIps } = require('../../services/auth/fingerprintSignup.service');
    if (clientStoreCode) {
      await assertClientStoreMatchesRequestOrigin(clientStoreCode, req);
    }
    const bonusCode = req.body && req.body.bonusCode;
    const bc = req.body && req.body.bc;
    const data = await authService.loginWithFacebook(accessToken, {
      clientStoreCode,
      bonusCode,
      bc,
      ref: req.body && (req.body.ref || req.body.affiliateCode),
      affiliateCode: req.body && req.body.affiliateCode,
      guestSpinWonAt: req.body && req.body.guestSpinWonAt,
      guestSpinAmountSc: req.body && req.body.guestSpinAmountSc,
      fingerprintRequestId: req.body && req.body.fingerprintRequestId,
      clientIps: collectSignupClientIps(req)
    });
    if (data && data.token && data.user && data.user.userId) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, data);
  } catch (err) {
    // Never log tokens. Log only error type and status for security.
    logger.error('Facebook login failed', { statusCode: err.statusCode || 500, message: err.message });
    const status = err.statusCode || 500;
    const clientMessage =
      status === 401 || status === 400 || status === 403
        ? (typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Invalid or expired Facebook sign-in. Please try again.')
        : 'Sign-in failed. Please try again later.';
    sendError(res, clientMessage, status, err.code || null, err.data ? { data: err.data } : null);
  }
}

async function completeOnboarding(req, res) {
  try {
    const data = await authService.completeOnboarding(req.user.userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = err.message || 'Failed to complete onboarding';
    sendError(res, message, status);
  }
}

async function refreshToken(req, res) {
  try {
    const refreshTokenValue = extractCookie(req, REFRESH_COOKIE_NAME);
    const data = await authService.refreshAccessToken(refreshTokenValue);
    if (data && data.user && data.user.userId) {
      setRefreshTokenCookie(res, data.user);
    }
    sendSuccess(res, { token: data.token });
  } catch (err) {
    clearRefreshTokenCookie(res);
    const status = err.statusCode || 401;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Your session expired. Please sign in again.';
    sendError(res, message, status);
  }
}

async function logout(req, res) {
  clearRefreshTokenCookie(res);
  sendSuccess(res, { success: true });
}

module.exports = {
  register,
  login,
  getMe,
  sendVerificationEmail,
  verifyEmail,
  refreshEmailToken,
  forgotPassword,
  resetPassword,
  googleLogin,
  googleLoginWithCode,
  facebookLogin,
  completeOnboarding,
  refreshToken,
  logout
};
