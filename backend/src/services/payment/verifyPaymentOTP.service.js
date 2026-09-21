'use strict';

const paymentClient = require('./paymentClient');
const { isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

/**
 * Verify OTP via Payment API (CentryOS). Marks email as verified so signup can proceed.
 * POST /email/verify-otp — same as CentryOS frontend "Verify OTP".
 *
 * @param {{ email: string, otp: string }} params
 * @returns {Promise<{ message: string }>}
 */
async function verifyPaymentOTP(params) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('verifyPaymentOTP: Payment API not configured');
    const err = new Error('Payment API is not configured');
    err.statusCode = 503;
    throw err;
  }
  const email = (params?.email || '').toString().trim().toLowerCase();
  const otp = (params?.otp ?? '').toString().trim();
  if (!email) {
    const err = new Error('Email is required');
    err.statusCode = 400;
    throw err;
  }
  if (!otp) {
    const err = new Error('OTP is required');
    err.statusCode = 400;
    throw err;
  }
  paymentLog('verifyPaymentOTP: calling Payment API POST /email/verify-otp for', email);
  const data = await paymentClient.request('POST', 'email/verify-otp', {
    body: { email, otp }
  });
  paymentLog('verifyPaymentOTP: success');
  return data || { message: 'OTP verified successfully' };
}

module.exports = { verifyPaymentOTP };
