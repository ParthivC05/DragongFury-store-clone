'use strict';

const paymentClient = require('./paymentClient');
const { isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

/**
 * Send OTP to email via Payment API (CentryOS). Required before signup.
 * POST /email/otp — same as CentryOS frontend "Send OTP".
 *
 * @param {{ email: string }} params
 * @returns {Promise<{ message: string }>}
 */
async function sendPaymentOTP(params) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('sendPaymentOTP: Payment API not configured');
    const err = new Error('Payment API is not configured');
    err.statusCode = 503;
    throw err;
  }
  const email = (params?.email || '').toString().trim().toLowerCase();
  if (!email) {
    const err = new Error('Email is required');
    err.statusCode = 400;
    throw err;
  }
  paymentLog('sendPaymentOTP: calling Payment API POST /email/otp for', email);
  const data = await paymentClient.request('POST', 'email/otp', {
    body: { email }
  });
  paymentLog('sendPaymentOTP: success');
  return data || { message: 'OTP sent successfully' };
}

module.exports = { sendPaymentOTP };
