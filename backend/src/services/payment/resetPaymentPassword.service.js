'use strict';

const { request } = require('./orionstarpay/client');
const { resolvePaymentPartnerCode, isPaymentConfigured } = require('./payment.config');

function requirePaymentConfig() {
  if (!isPaymentConfigured()) {
    const err = new Error('Payment API is not configured');
    err.statusCode = 503;
    throw err;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function resolveStoreCode(partnerCode) {
  return resolvePaymentPartnerCode(partnerCode);
}

async function checkPaymentUserDirect({ email, partnerCode } = {}) {
  requirePaymentConfig();
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) {
    const err = new Error('Email is required');
    err.statusCode = 400;
    throw err;
  }
  const partnerCodeResolved = resolveStoreCode(partnerCode);
  return request('POST', '/auth/user/check/direct', {
    body: {
      email: emailNorm,
      partnerCode: partnerCodeResolved
    }
  });
}

async function requestPaymentPasswordResetOtp({ email, partnerCode } = {}) {
  requirePaymentConfig();
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) {
    const err = new Error('Email is required');
    err.statusCode = 400;
    throw err;
  }
  const storeCode = resolveStoreCode(partnerCode);
  console.log('[OrionStarsPay OTP] request-otp payload:', {
    email: emailNorm,
    storeCode
  });
  const data = await request('POST', '/auth/password-reset/request-otp', {
    body: {
      email: emailNorm,
      storeCode
    }
  });
  console.log('[OrionStarsPay OTP] request-otp response:', data);
  return data;
}

async function verifyPaymentPasswordResetOtp({ email, otp } = {}) {
  requirePaymentConfig();
  const emailNorm = normalizeEmail(email);
  const otpTrim = String(otp || '').trim();
  if (!emailNorm || !otpTrim) {
    const err = new Error('Email and OTP are required');
    err.statusCode = 400;
    throw err;
  }
  return request('POST', '/auth/password-reset/verify-otp', {
    body: {
      email: emailNorm,
      otp: otpTrim
    }
  });
}

async function confirmPaymentPasswordReset({ email, partnerCode, newPassword } = {}) {
  requirePaymentConfig();
  const emailNorm = normalizeEmail(email);
  const password = String(newPassword || '');
  if (!emailNorm || !password) {
    const err = new Error('Email and new password are required');
    err.statusCode = 400;
    throw err;
  }
  return request('POST', '/auth/password-reset/confirm', {
    body: {
      email: emailNorm,
      storeCode: resolveStoreCode(partnerCode),
      newPassword: password
    }
  });
}

module.exports = {
  checkPaymentUserDirect,
  requestPaymentPasswordResetOtp,
  verifyPaymentPasswordResetOtp,
  confirmPaymentPasswordReset
};
